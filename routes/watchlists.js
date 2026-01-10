const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Watchlist = require("../models/Watchlist"); // Import the Mongoose Model

// @route   POST /api/watchlists (Create)
router.post("/", auth, async (req, res) => {
  try {
    const newWatchlist = new Watchlist({
      name: req.body.name,
      user: req.user.id, // Link to the user
      movies: []
    });
    const watchlist = await newWatchlist.save();
    res.json(watchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET /api/watchlists (Fetch All for Dashboard)
router.get("/", auth, async (req, res) => {
  try {
    const watchlists = await Watchlist.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(watchlists);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET /api/watchlists/:id (Fetch Single Detail)
router.get("/:id", auth, async (req, res) => {
  try {
    // 1. Find the watchlist by ID
    const watchlist = await Watchlist.findById(req.params.id);

    // 2. Check if it exists
    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    // 3. Check ownership (Security)
    if (watchlist.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    res.json(watchlist);
  } catch (err) {
    console.error(err.message);
    // If ID is invalid (not a MongoDB ObjectId), return 404
    if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: "Watchlist not found" });
    }
    res.status(500).send("Server Error");
  }
});

// @route   POST /api/watchlists/:id/movies (Add Movie)
router.post("/:id/movies", auth, async (req, res) => {
  const { movieId, movieTitle, posterPath } = req.body;
  try {
    const watchlist = await Watchlist.findById(req.params.id);

    if (!watchlist) return res.status(404).json({ msg: "Not found" });
    if (watchlist.user.toString() !== req.user.id) return res.status(401).json({ msg: "Not authorized" });

    // Check for duplicates
    if (watchlist.movies.some(m => m.movieId === movieId)) {
      return res.status(400).json({ msg: "Movie already in list" });
    }

    // Add to array
    watchlist.movies.push({ movieId, movieTitle, posterPath });
    await watchlist.save();

    res.json(watchlist.movies);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE /api/watchlists/:id (Delete List)
router.delete("/:id", auth, async (req, res) => {
  try {
    const watchlist = await Watchlist.findById(req.params.id);
    if (!watchlist) return res.status(404).json({ msg: "Not found" });
    if (watchlist.user.toString() !== req.user.id) return res.status(401).json({ msg: "Not authorized" });

    await watchlist.deleteOne();
    res.json({ msg: "Watchlist removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE /api/watchlists/:watchlistId/movies/:movieId (Remove Movie)
router.delete("/:watchlistId/movies/:movieId", auth, async (req, res) => {
  try {
    const watchlist = await Watchlist.findById(req.params.watchlistId);
    if (!watchlist) return res.status(404).json({ msg: "Not found" });
    if (watchlist.user.toString() !== req.user.id) return res.status(401).json({ msg: "Not authorized" });

    // Filter out the movie
    watchlist.movies = watchlist.movies.filter(m => m.movieId !== parseInt(req.params.movieId));
    await watchlist.save();

    res.json({ msg: "Movie removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;