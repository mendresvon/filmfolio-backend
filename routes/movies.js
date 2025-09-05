const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth");

// @route   GET /api/movies/search
// @desc    Search for movies from TMDB
// @access  Private
router.get("/search", auth, async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ msg: "Search query is required" });
  }

  const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${
    process.env.TMDB_API_KEY
  }&query=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(tmdbUrl);

    // We can format the data to send back only what our frontend needs
    const formattedMovies = response.data.results
      .filter((movie) => movie.poster_path) // This line removes the bad data
      .map((movie) => ({
        id: movie.id,
        title: movie.title,
        posterPath: movie.poster_path,
        releaseDate: movie.release_date,
      }));

    res.json(formattedMovies);
  } catch (err) {
    console.error("Error fetching from TMDB:", err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
