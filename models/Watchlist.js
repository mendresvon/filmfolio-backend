const mongoose = require("mongoose");

const WatchlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Links this watchlist to a specific User
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  // Embedded Array: No more separate "WatchlistMovie" table needed!
  movies: [
    {
      movieId: Number, // TMDB ID
      movieTitle: String,
      posterPath: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Watchlist", WatchlistSchema);
