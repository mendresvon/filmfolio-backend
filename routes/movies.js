const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth");
const Redis = require("ioredis");

// Initialize Redis using an environment variable
const redis = new Redis(process.env.REDIS_URL);

router.get("/search", async (req, res) => {
  const query = req.query.query;
  const cacheKey = `movies:search:${query}`;

  try {
    // 1. Check if the results are already in the cache
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      console.log(`Cache Hit for: ${query}`);
      return res.json(JSON.parse(cachedData));
    }

    // 2. If not in cache, fetch from TMDB API
    console.log(`Cache Miss for: ${query}. Fetching from TMDB...`);
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${query}`
    );

    // 3. Store the result in Redis for 1 hour (3600 seconds)
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", 3600);

    res.json(response.data);
  } catch (error) {
    console.error("Redis or TMDB Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

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
