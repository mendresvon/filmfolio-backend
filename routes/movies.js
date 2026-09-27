const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth"); // Keep auth for security
const redisConnection = require("../utils/redisClient");
const {
  MAX_SEARCH_QUERY_CODE_POINTS,
  isSearchQueryTooLong,
} = require("../utils/movieSearch");

// @route   GET /api/movies/search
// @desc    Search movies from TMDB with Redis caching
// @access  Private
router.get("/search", auth, async (req, res) => {
  const query = req.query.query;

  // Validate before touching Redis or TMDB.
  if (typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ msg: "Search query is required" });
  }

  if (isSearchQueryTooLong(query)) {
    return res.status(400).json({
      msg: `Search query must be ${MAX_SEARCH_QUERY_CODE_POINTS} Unicode code points or fewer`,
    });
  }

  const cacheKey = `movies:search:${query.toLowerCase().trim()}`;

  // Try the cache first, but only if Redis is available
  let cachedData = null;
  if (redisConnection.isAvailable) {
    try {
      cachedData = await redisConnection.client.get(cacheKey);
    } catch (redisError) {
      // Redis went down mid-request - that's fine, we'll just fetch from the API
      console.warn(`Redis unavailable, skipping cache: ${redisError.message}`);
    }
  }

  if (cachedData) {
    console.log(`Cache Hit for: ${query}`);
    try {
      const cachedMovies = JSON.parse(cachedData);
      if (!Array.isArray(cachedMovies)) {
        throw new TypeError("Cached movie search data must be an array");
      }
      return res.json(cachedMovies);
    } catch {
      // Treat corrupt cache data as a miss so one bad entry cannot break search.
      console.warn(`Invalid cached movie search data for: ${query}`);
      try {
        await redisConnection.client.del(cacheKey);
      } catch (redisError) {
        console.warn(`Failed to remove invalid cache entry: ${redisError.message}`);
      }
    }
  }

  // Cache miss or Redis unavailable - fetch from TMDB
  console.log(`Cache Miss for: ${query}. Fetching from TMDB...`);

  try {
    const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${
      process.env.TMDB_API_KEY
    }&query=${encodeURIComponent(query)}`;

    const response = await axios.get(tmdbUrl);

    // Format data for frontend and remove entries without posters
    const formattedMovies = response.data.results
      .filter((movie) => movie.poster_path)
      .map((movie) => ({
        id: movie.id,
        title: movie.title,
        posterPath: movie.poster_path,
        releaseDate: movie.release_date,
      }));

    // Try to cache the results, but only if Redis is available
    if (redisConnection.isAvailable) {
      try {
        await redisConnection.client.set(cacheKey, JSON.stringify(formattedMovies), "EX", 3600);
      } catch (redisError) {
        console.warn(`Failed to cache results: ${redisError.message}`);
      }
    }

    res.json(formattedMovies);
  } catch (error) {
    console.error("TMDB API Error:", error.message);
    res.status(500).json({ error: "Failed to fetch movies" });
  }
});

module.exports = router;
