const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth"); // Keep auth for security
const Redis = require("ioredis");

// Redis with fallback - won't break if unavailable
let redis = null;
let redisAvailable = false;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    connectTimeout: 5000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 2 ? null : 500),
    lazyConnect: true,
  });

  redis.on("connect", () => {
    redisAvailable = true;
    console.log("Redis connected successfully");
  });

  redis.on("error", (err) => {
    redisAvailable = false;
    console.warn(`Redis error: ${err.message}`);
  });

  redis.connect().catch(() => {});
}

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

  // Try the cache first, but only if Redis is available
  let cachedData = null;
  if (redis && redisAvailable) {
    try {
      cachedData = await redis.get(cacheKey);
    } catch (redisError) {
      // Redis went down mid-request - that's fine, we'll just fetch from the API
      console.warn(`Redis unavailable, skipping cache: ${redisError.message}`);
    }
  }

  if (cachedData) {
    console.log(`Cache Hit for: ${query}`);
    return res.json(JSON.parse(cachedData));
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
    if (redis && redisAvailable) {
      try {
        await redis.set(cacheKey, JSON.stringify(formattedMovies), "EX", 3600);
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