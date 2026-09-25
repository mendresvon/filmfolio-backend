const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.JWT_SECRET = "movie-search-test-secret";
delete process.env.REDIS_URL;

const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { MAX_SEARCH_QUERY_LENGTH } = require("../utils/movieSearch");
const redisConnection = require("../utils/redisClient");

let redisGetCalls = 0;
let tmdbCalls = 0;

const originalAxiosGet = axios.get;

Object.defineProperty(redisConnection, "client", {
  value: {
    async get() {
      redisGetCalls += 1;
      return null;
    },
    async set() {
      return "OK";
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

async function search(query) {
  const url = new URL("/api/movies/search", `http://127.0.0.1:${server.address().port}`);
  if (query !== undefined) url.searchParams.set("query", query);

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
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
  const response = await search("a".repeat(MAX_SEARCH_QUERY_LENGTH));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  assert.equal(redisGetCalls, 1);
  assert.equal(tmdbCalls, 1);
});

test("rejects an overlong query before Redis or TMDB work", async () => {
  redisGetCalls = 0;
  tmdbCalls = 0;

  const response = await search("a".repeat(MAX_SEARCH_QUERY_LENGTH + 1));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    msg: `Search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer`,
  });
  assert.equal(redisGetCalls, 0);
  assert.equal(tmdbCalls, 0);
});
