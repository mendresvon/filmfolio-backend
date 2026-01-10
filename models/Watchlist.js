const mongoose = require("mongoose");

const WatchlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    movies: [
      {
        movieId: Number,
        movieTitle: String,
        posterPath: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

WatchlistSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Watchlist", WatchlistSchema);
