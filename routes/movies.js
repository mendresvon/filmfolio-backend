const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth");

// search movies from tmdb
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

    // format data for frontend and remove incomplete entries
    const formattedMovies = response.data.results
      .filter((movie) => movie.poster_path) // remove movies without posters
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
