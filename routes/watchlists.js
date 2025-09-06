const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const auth = require("../middleware/auth"); // Import our auth middleware

const prisma = new PrismaClient();

// @route   POST /api/watchlists
// @desc    Create a new watchlist
// @access  Private
router.post("/", auth, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ msg: "Please provide a name for the watchlist" });
  }

  try {
    const newWatchlist = await prisma.watchlist.create({
      data: {
        name: name,
        userId: req.user.id,
      },
    });

    res.status(201).json(newWatchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   PUT /api/watchlists/:id
// @desc    Update a watchlist (name and description)
// @access  Private
router.put("/:id", auth, async (req, res) => {
  const { name, description } = req.body;
  const watchlistId = req.params.id;
  const userId = req.user.id;

  if (!name) {
    return res.status(400).json({ msg: "Watchlist name is required" });
  }

  try {
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
    });

    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    if (watchlist.userId !== userId) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    const updatedWatchlist = await prisma.watchlist.update({
      where: { id: watchlistId },
      data: {
        name: name,
        description: description, // Can be null or a string
      },
    });

    res.json(updatedWatchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET /api/watchlists
// @desc    Get all watchlists for a user
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const watchlists = await prisma.watchlist.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        movies: true, // Include all associated movies for each watchlist
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(watchlists);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE /api/watchlists/:id
// @desc    Delete a watchlist
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const watchlistId = req.params.id;
    const userId = req.user.id;

    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
    });

    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    if (watchlist.userId !== userId) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    await prisma.watchlistMovie.deleteMany({
      where: { watchlistId: watchlistId },
    });

    await prisma.watchlist.delete({
      where: { id: watchlistId },
    });

    res.json({ msg: "Watchlist removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   POST /api/watchlists/:id/movies
// @desc    Add a movie to a watchlist
// @access  Private
router.post("/:id/movies", auth, async (req, res) => {
  const { movieId, movieTitle, posterPath } = req.body;
  const watchlistId = req.params.id;
  const userId = req.user.id;

  if (!movieId || !movieTitle || posterPath === undefined) {
    return res.status(400).json({ msg: "Please provide movieId, movieTitle, and posterPath" });
  }

  try {
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
    });

    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    if (watchlist.userId !== userId) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    const newWatchlistMovie = await prisma.watchlistMovie.create({
      data: {
        watchlistId: watchlistId,
        movieId: movieId,
        movieTitle: movieTitle,
        posterPath: posterPath,
      },
    });

    res.status(201).json(newWatchlistMovie);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ msg: "Movie is already in this watchlist." });
    }
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE /api/watchlists/:watchlistId/movies/:movieId
// @desc    Remove a movie from a watchlist
// @access  Private
router.delete("/:watchlistId/movies/:movieId", auth, async (req, res) => {
  const { watchlistId, movieId } = req.params;
  const userId = req.user.id;

  try {
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
    });

    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    if (watchlist.userId !== userId) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    const deleteResult = await prisma.watchlistMovie.deleteMany({
      where: {
        watchlistId: watchlistId,
        movieId: parseInt(movieId),
      },
    });

    if (deleteResult.count === 0) {
      return res.status(404).json({ msg: "Movie not found in this watchlist" });
    }

    res.json({ msg: "Movie removed from watchlist" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET /api/watchlists/:id
// @desc    Get a single watchlist by ID
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    // Step 1: Find the watchlist by its ID first.
    const watchlist = await prisma.watchlist.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        movies: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    // Step 2: If it doesn't exist at all, return a 404.
    if (!watchlist) {
      return res.status(404).json({ msg: "Watchlist not found" });
    }

    // Step 3: If it exists, check if the logged-in user owns it.
    if (watchlist.userId !== req.user.id) {
      return res.status(401).json({ msg: "Authorization denied" });
    }

    // If both checks pass, send the watchlist.
    res.json(watchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
