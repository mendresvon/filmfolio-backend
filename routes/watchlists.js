const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Watchlist = require("../models/Watchlist");

// create watchlist
router.post("/", auth, async (req, res) => {
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
});

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

// add movie to watchlist
router.post("/:id/movies", auth, async (req, res) => {
  const { movieId, movieTitle, posterPath } = req.body;
  try {
    const watchlist = await Watchlist.findById(req.params.id);

    if (!watchlist) return res.status(404).json({ msg: "Not found" });
    if (watchlist.user.toString() !== req.user.id)
      return res.status(401).json({ msg: "Not authorized" });

    // check duplicates
    if (watchlist.movies.some((m) => m.movieId === movieId)) {
      return res.status(400).json({ msg: "Movie already in list" });
    }

    // add to list
    watchlist.movies.push({ movieId, movieTitle, posterPath });
    await watchlist.save();

    res.json(watchlist.movies);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// update watchlist
router.put("/:id", auth, async (req, res) => {
  const { name, description } = req.body;

  // build update object
  const watchlistFields = {};
  if (name) watchlistFields.name = name;
  if (description) watchlistFields.description = description;

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
});

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

// remove movie from watchlist
router.delete("/:watchlistId/movies/:movieId", auth, async (req, res) => {
  try {
    const watchlist = await Watchlist.findById(req.params.watchlistId);
    if (!watchlist) return res.status(404).json({ msg: "Not found" });
    if (watchlist.user.toString() !== req.user.id)
      return res.status(401).json({ msg: "Not authorized" });

    // filter out movie
    watchlist.movies = watchlist.movies.filter((m) => m.movieId !== parseInt(req.params.movieId));
    await watchlist.save();

    res.json({ msg: "Movie removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
