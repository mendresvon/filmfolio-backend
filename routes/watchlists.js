const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const Watchlist = require("../models/Watchlist");

const MAX_MOVIES_PER_WATCHLIST = 500;

// create watchlist
router.post(
  "/",
  [
    auth,
    check("name", "Name is required").notEmpty().trim(),
    check("name", "Name must be under 100 characters").isLength({ max: 100 }),
    check("description", "Description must be under 500 characters").optional().isLength({ max: 500 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const newWatchlist = new Watchlist({
        name: req.body.name,
        description: req.body.description || "",
        user: req.user.id,
        movies: [],
      });
      const watchlist = await newWatchlist.save();
      res.json(watchlist);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
  }
);

// fetch all watchlists
router.get("/", auth, async (req, res) => {
  try {
    const watchlists = await Watchlist.find({ user: req.user.id }).sort({ createdAt: 1 });
    res.json(watchlists);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// fetch single watchlist
router.get("/:id", auth, async (req, res) => {
  try {
    // find watchlist
    const watchlist = await Watchlist.findById(req.params.id);

    // check existence
    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    // check ownership
    if (watchlist.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    res.json(watchlist);
  } catch (err) {
    console.error(err.message);
    // return 404 on invalid id
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Watchlist not found" });
    }
    res.status(500).send("Server Error");
  }
});

// add movie to watchlist - uses atomic $addToSet to prevent race conditions
router.post("/:id/movies", auth, async (req, res) => {
  const { movieId, movieTitle, posterPath } = req.body;

  if (!movieId || !movieTitle) {
    return res.status(400).json({ msg: "movieId and movieTitle are required" });
  }

  try {
    // first check if watchlist exists, is owned by user, and has room
    const existing = await Watchlist.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!existing) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    if (existing.movies.length >= MAX_MOVIES_PER_WATCHLIST) {
      return res.status(400).json({ msg: `Watchlist is full (max ${MAX_MOVIES_PER_WATCHLIST} movies)` });
    }

    // atomic update: only adds if movie doesn't exist (prevents race condition)
    const watchlist = await Watchlist.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.id,
        "movies.movieId": { $ne: movieId }, // movie must NOT already exist
      },
      {
        $push: {
          movies: { movieId, movieTitle, posterPath, createdAt: new Date() },
        },
      },
      { new: true }
    );

    if (!watchlist) {
      return res.status(400).json({ msg: "Movie already in list" });
    }

    res.json(watchlist.movies);
  } catch (err) {
    console.error(err.message);
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Watchlist not found" });
    }
    res.status(500).send("Server Error");
  }
});

// update watchlist
router.put(
  "/:id",
  [
    auth,
    check("name", "Name must be under 100 characters").optional().isLength({ max: 100 }),
    check("description", "Description must be under 500 characters").optional().isLength({ max: 500 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;

    // build update object
    const watchlistFields = {};
    if (name) watchlistFields.name = name;
    if (description !== undefined) watchlistFields.description = description;

    try {
      let watchlist = await Watchlist.findById(req.params.id);

      if (!watchlist) return res.status(404).json({ msg: "Watchlist not found" });

      // verify ownership
      if (watchlist.user.toString() !== req.user.id) {
        return res.status(401).json({ msg: "Not authorized" });
      }

      watchlist = await Watchlist.findByIdAndUpdate(
        req.params.id,
        { $set: watchlistFields },
        { new: true }
      );

      res.json(watchlist);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
  }
);

// delete watchlist
router.delete("/:id", auth, async (req, res) => {
  try {
    const watchlist = await Watchlist.findById(req.params.id);
    if (!watchlist) return res.status(404).json({ msg: "Not found" });
    if (watchlist.user.toString() !== req.user.id)
      return res.status(401).json({ msg: "Not authorized" });

    await watchlist.deleteOne();
    res.json({ msg: "Watchlist removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// remove movie from watchlist - uses atomic $pull for efficiency
router.delete("/:watchlistId/movies/:movieId", auth, async (req, res) => {
  try {
    const result = await Watchlist.updateOne(
      { _id: req.params.watchlistId, user: req.user.id },
      { $pull: { movies: { movieId: parseInt(req.params.movieId) } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    res.json({ msg: "Movie removed" });
  } catch (err) {
    console.error(err.message);
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Watchlist not found" });
    }
    res.status(500).send("Server Error");
  }
});

module.exports = router;
