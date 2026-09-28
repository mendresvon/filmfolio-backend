const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.JWT_SECRET = "movie-search-test-secret";
delete process.env.REDIS_URL;

const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { MAX_SEARCH_QUERY_CODE_POINTS } = require("../utils/movieSearch");
const redisConnection = require("../utils/redisClient");

let redisGetCalls = 0;
let redisDeleteCalls = 0;
let tmdbCalls = 0;
let cachedData = null;
let failRedisDelete = false;
const rateLimitBuckets = new Map();

const originalAxiosGet = axios.get;

Object.defineProperty(redisConnection, "client", {
  value: {
    async get() {
      redisGetCalls += 1;
      return cachedData;
    },
    async del() {
      redisDeleteCalls += 1;
      if (failRedisDelete) throw new Error("Redis unavailable");
      cachedData = null;
      return 1;
    },
    async set() {
      return "OK";
    },
    async eval(_script, _numberOfKeys, key, windowMs) {
      const currentTime = Date.now();
      let bucket = rateLimitBuckets.get(key);

      if (!bucket || bucket.resetAt <= currentTime) {
        bucket = { count: 0, resetAt: currentTime + windowMs };
      }

      bucket.count += 1;
      rateLimitBuckets.set(key, bucket);

      return [bucket.count, Math.max(0, bucket.resetAt - currentTime)];
    },
  },
});
Object.defineProperty(redisConnection, "isAvailable", { value: true });

axios.get = async function getTmdbForTest() {
  tmdbCalls += 1;
  return { data: { results: [] } };
};

const app = express();
app.use("/api/movies", require("../routes/movies"));

const server = app.listen(0);
const token = jwt.sign({ user: { id: "test-user" } }, process.env.JWT_SECRET);

before(async () => {
  await new Promise((resolve) => server.once("listening", resolve));
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  axios.get = originalAxiosGet;
});

async function search(query, authToken = token) {
  const url = new URL("/api/movies/search", `http://127.0.0.1:${server.address().port}`);
  if (query !== undefined) url.searchParams.set("query", query);

  return fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

test("rejects missing and empty queries before Redis or TMDB work", async () => {
  for (const query of [undefined, "", "   "]) {
    const response = await search(query);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { msg: "Search query is required" });
  }

  assert.equal(redisGetCalls, 0);
  assert.equal(tmdbCalls, 0);
});

test("accepts a query at the maximum length", async () => {
  for (const query of [
    "a".repeat(MAX_SEARCH_QUERY_CODE_POINTS),
    "😀".repeat(MAX_SEARCH_QUERY_CODE_POINTS),
  ]) {
    const response = await search(query);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }

  assert.equal(redisGetCalls, 2);
  assert.equal(tmdbCalls, 2);
});

test("rejects an overlong query before Redis or TMDB work", async () => {
  redisGetCalls = 0;
  tmdbCalls = 0;

  for (const query of [
    "a".repeat(MAX_SEARCH_QUERY_CODE_POINTS + 1),
    "😀".repeat(MAX_SEARCH_QUERY_CODE_POINTS + 1),
  ]) {
    const response = await search(query);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      msg: `Search query must be ${MAX_SEARCH_QUERY_CODE_POINTS} Unicode code points or fewer`,
    });
  }

  assert.equal(redisGetCalls, 0);
  assert.equal(tmdbCalls, 0);
});

test("treats malformed cache data as a miss and fetches fresh results", async () => {
  redisGetCalls = 0;
  redisDeleteCalls = 0;
  tmdbCalls = 0;

  for (const [index, value] of ["{invalid-json", "null"].entries()) {
    cachedData = value;
    failRedisDelete = index === 1;

    const response = await search("Arrival");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }

  failRedisDelete = false;
  assert.equal(redisGetCalls, 2);
  assert.equal(redisDeleteCalls, 2);
  assert.equal(tmdbCalls, 2);
});

test("limits movie searches before reading Redis or calling TMDB", async () => {
  const rateLimitedToken = jwt.sign({ user: { id: "rate-limited-user" } }, process.env.JWT_SECRET);
  const originalLog = console.log;
  console.log = () => {};
  redisGetCalls = 0;
  tmdbCalls = 0;
  cachedData = null;

  try {
    for (let index = 0; index < 60; index += 1) {
      const response = await search(`Movie ${index}`, rateLimitedToken);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
    }

    const blocked = await search("One too many", rateLimitedToken);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("Retry-After")) > 0);
    assert.deepEqual(await blocked.json(), {
      msg: "Too many movie searches. Please try again later.",
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(redisGetCalls, 60);
  assert.equal(tmdbCalls, 60);
});
