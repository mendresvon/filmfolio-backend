const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth"); // Keep auth for security
const Redis = require("ioredis");

// Initialize Redis using an environment variable
const redis = new Redis(process.env.REDIS_URL);

// @route   GET /api/movies/search
// @desc    Search movies from TMDB with Redis caching
// @access  Private
router.get("/search", auth, async (req, res) => {
  const query = req.query.query;

  // 1. Validation: Ensure a query exists
  if (!query) {
    return res.status(400).json({ msg: "Search query is required" });
  }

  const cacheKey = `movies:search:${query.toLowerCase().trim()}`;

  try {
    // 2. Check if the results are already in the cache
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      console.log(`Cache Hit for: ${query}`);
      return res.json(JSON.parse(cachedData));
    }

    // 3. Cache Miss: Fetch from TMDB API
    console.log(`Cache Miss for: ${query}. Fetching from TMDB...`);
    
    // Use encodeURIComponent to handle special characters in titles
    const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${
      process.env.TMDB_API_KEY
    }&query=${encodeURIComponent(query)}`;

    const response = await axios.get(tmdbUrl);

    // 4. Format data for frontend and remove entries without posters
    // This ensures your frontend doesn't break when a movie has no image
    const formattedMovies = response.data.results
      .filter((movie) => movie.poster_path) 
      .map((movie) => ({
        id: movie.id,           // Expected by handleAddMovie
        title: movie.title,     // Expected by resultsGrid
        posterPath: movie.poster_path, // Matches frontend property name
        releaseDate: movie.release_date,
      }));

    // 5. Store the formatted results in Redis for 1 hour (3600 seconds)
    await redis.set(cacheKey, JSON.stringify(formattedMovies), "EX", 3600);

    res.json(formattedMovies);
  } catch (error) {
    console.error("Redis or TMDB Error:", error.message);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;