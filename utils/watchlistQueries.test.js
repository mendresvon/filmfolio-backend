const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAddMovieFilter, MAX_MOVIES_PER_WATCHLIST } = require("./watchlistQueries");

test("movie add filter atomically checks ownership, uniqueness, and list capacity", () => {
  assert.deepEqual(
    buildAddMovieFilter({ watchlistId: "list-1", userId: "user-1", movieId: 42 }),
    {
      _id: "list-1",
      user: "user-1",
      "movies.movieId": { $ne: 42 },
      $expr: {
        $lt: [{ $size: { $ifNull: ["$movies", []] } }, MAX_MOVIES_PER_WATCHLIST],
      },
    }
  );
  assert.equal(MAX_MOVIES_PER_WATCHLIST, 500);
});
