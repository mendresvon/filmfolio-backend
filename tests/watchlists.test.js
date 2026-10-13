const assert = require("node:assert/strict");
const { after, afterEach, before, beforeEach, mock, test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const Watchlist = require("../models/Watchlist");
const { buildAddMovieFilter } = require("../utils/watchlistQueries");

process.env.JWT_SECRET = "watchlist-test-secret";

const app = express();
app.use(express.json());
app.use("/api/watchlists", require("../routes/watchlists"));
const server = app.listen(0);
const token = jwt.sign({ user: { id: "test-user" } }, process.env.JWT_SECRET);
let movies;
let calls;

before(async () => {
  await new Promise((resolve) => server.once("listening", resolve));
});

beforeEach(() => {
  movies = [{ movieId: 123, movieTitle: "Existing movie" }];
  calls = { reads: 0, adds: [], removes: [] };
  mock.method(Watchlist, "findOne", async () => {
    calls.reads += 1;
    return { movies };
  });
  mock.method(Watchlist, "findOneAndUpdate", async (filter, update, options) => {
    calls.adds.push({ filter, update, options });
    movies.push(update.$push.movies);
    return { movies };
  });
  mock.method(Watchlist, "updateOne", async (filter, update) => {
    calls.removes.push({ filter, update });
    movies = movies.filter((movie) => movie.movieId !== update.$pull.movies.movieId);
    return { matchedCount: 1 };
  });
});

afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function request(method, suffix, body, authenticated = true) {
  return fetch(`http://127.0.0.1:${server.address().port}/api/watchlists/list-1/movies${suffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function assertNoDatabaseWork() {
  assert.deepEqual(calls, { reads: 0, adds: [], removes: [] });
  assert.deepEqual(movies, [{ movieId: 123, movieTitle: "Existing movie" }]);
}

test("malformed removal IDs cannot partially match and delete an existing movie", async () => {
  for (const movieId of [
    "123abc", "123.5", "123.0", "123e2", "123 extra", "-123", "0", "0x7b",
    "+123", " 123", "123 ", " ", "NaN", "Infinity", "9007199254740992",
  ]) {
    const response = await request("DELETE", `/${encodeURIComponent(movieId)}`);
    assert.equal(response.status, 400, movieId);
    assert.deepEqual(await response.json(), { msg: "movieId must be a positive safe integer" });
    assertNoDatabaseWork();
  }
});

test("an empty removal path cannot modify a watchlist", async () => {
  const response = await request("DELETE", "/");
  assert.equal(response.status, 404);
  assertNoDatabaseWork();
});

test("valid removal uses a numeric ID and retains ownership filtering", async () => {
  const response = await request("DELETE", "/123");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { msg: "Movie removed" });
  assert.deepEqual(movies, []);
  assert.deepEqual(calls.removes, [{
    filter: { _id: "list-1", user: "test-user" },
    update: { $pull: { movies: { movieId: 123 } } },
  }]);
});

test("removal preserves the missing or unowned watchlist response", async () => {
  mock.restoreAll();
  mock.method(Watchlist, "updateOne", async () => ({ matchedCount: 0 }));
  const response = await request("DELETE", "/550");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { msg: "Watchlist not found" });
});

test("addition rejects invalid IDs before any watchlist read or write", async () => {
  for (const movieId of [
    -123, 123.5, "123abc", undefined, null, "", " ", 0, "123.5", "123.0",
    "1e3", "0x7b", "+123", " 123", "123 ", "-123", "0", "Infinity",
    true, false, [], [123], {}, { $gt: 0 }, 9007199254740992, "9007199254740992",
  ]) {
    const response = await request("POST", "", { movieId, movieTitle: "Valid title" });
    assert.equal(response.status, 400, JSON.stringify(movieId));
    assert.deepEqual(await response.json(), { msg: "movieId must be a positive safe integer" });
    assertNoDatabaseWork();
  }
});

test("addition rejects missing, whitespace-only, and non-string titles without writes", async () => {
  for (const movieTitle of [" \t\n", undefined, null, "", 123, true, [], ["Title"], {}]) {
    const response = await request("POST", "", { movieId: 550, movieTitle });
    assert.equal(response.status, 400, JSON.stringify(movieTitle));
    assert.deepEqual(await response.json(), { msg: "movieTitle must be a nonempty string" });
    assertNoDatabaseWork();
  }
});

test("addition rejects a missing request body without database work", async () => {
  const response = await request("POST", "");
  assert.equal(response.status, 400);
  assertNoDatabaseWork();
});

test("addition preserves the missing or unowned watchlist response", async () => {
  mock.method(Watchlist, "findOne", async () => null);
  const response = await request("POST", "", { movieId: 550, movieTitle: "Fight Club" });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { msg: "Watchlist not found" });
  assert.equal(calls.adds.length, 0);
});

test("addition still rejects a full watchlist without writing", async () => {
  mock.method(Watchlist, "findOne", async () => ({ movies: Array(500).fill(movies[0]) }));
  const response = await request("POST", "", { movieId: 550, movieTitle: "Fight Club" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { msg: "Watchlist is full (max 500 movies)" });
  assert.equal(calls.adds.length, 0);
});

test("a normalized string ID still uses the atomic duplicate check", async () => {
  mock.method(Watchlist, "findOne", () => ({ movies, select: async () => ({ movies }) }));
  mock.method(Watchlist, "findOneAndUpdate", async (filter) => {
    assert.deepEqual(filter, buildAddMovieFilter({
      watchlistId: "list-1", userId: "test-user", movieId: 123,
    }));
    return null;
  });
  const response = await request("POST", "", { movieId: "00123", movieTitle: "Existing movie" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { msg: "Movie already in list" });
  assert.deepEqual(movies, [{ movieId: 123, movieTitle: "Existing movie" }]);
});

for (const movieId of [550, "550", "00550", 1, Number.MAX_SAFE_INTEGER]) {
  test(`addition accepts and normalizes valid movie ID ${JSON.stringify(movieId)}`, async () => {
    const movieTitle = "  我的電影: Part II 🎬  ";
    const response = await request("POST", "", { movieId, movieTitle, posterPath: null });
    assert.equal(response.status, 200);
    const added = (await response.json())[1];
    assert.equal(added.movieId, Number(movieId));
    assert.equal(added.movieTitle, movieTitle);
    assert.equal(added.posterPath, null);
    assert.equal(calls.reads, 1);
    assert.equal(calls.adds.length, 1);
    assert.deepEqual(calls.adds[0].filter, buildAddMovieFilter({
      watchlistId: "list-1", userId: "test-user", movieId: Number(movieId),
    }));
    assert.deepEqual(calls.adds[0].options, { new: true });
  });
}

test("TMDB movie data retains its title and poster path", async () => {
  const movie = { movieId: 550, movieTitle: "Fight Club", posterPath: "/poster.jpg" };
  const response = await request("POST", "", movie);
  assert.equal(response.status, 200);
  const added = (await response.json())[1];
  assert.deepEqual({ movieId: added.movieId, movieTitle: added.movieTitle, posterPath: added.posterPath }, movie);
});

test("movie endpoints still require authentication before database work", async () => {
  for (const [method, suffix, body] of [
    ["POST", "", { movieId: 550, movieTitle: "Fight Club" }], ["DELETE", "/123"],
  ]) {
    const response = await request(method, suffix, body, false);
    assert.equal(response.status, 401);
    assertNoDatabaseWork();
  }
});
