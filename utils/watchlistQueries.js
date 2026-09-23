const MAX_MOVIES_PER_WATCHLIST = 500;

const buildAddMovieFilter = ({ watchlistId, userId, movieId }) => ({
  _id: watchlistId,
  user: userId,
  "movies.movieId": { $ne: movieId },
  $expr: {
    $lt: [{ $size: { $ifNull: ["$movies", []] } }, MAX_MOVIES_PER_WATCHLIST],
  },
});

module.exports = { MAX_MOVIES_PER_WATCHLIST, buildAddMovieFilter };
