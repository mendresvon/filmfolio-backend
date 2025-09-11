require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client"); // Import Prisma Client

const prisma = new PrismaClient(); // Initialize Prisma Client
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Allow server to accept JSON data
app.use(express.urlencoded({ extended: true }));


// ============== ADD THIS NEW ENDPOINT ==============
// @route   GET /api/keep-alive
// @desc    An endpoint to be pinged by an uptime monitor to prevent idle shutdown
// @access  Public
app.get("/api/keep-alive", async (req, res) => {
  try {
    // Perform a simple, inexpensive query to wake up the database
    // This queries the first user, which is a very fast operation.
    await prisma.user.findFirst(); 
    res.status(200).send("Database connection is active.");
  } catch (error) {
    console.error("Keep-alive endpoint failed:", error.message);
    res.status(500).send("Failed to activate database connection.");
  }
});
// ===================================================


// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/watchlists", require("./routes/watchlists"));
app.use('/api/movies', require('./routes/movies'));

// Test Route
app.get("/", (req, res) => {
  res.send("FilmFolio API is running...");
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Note: The duplicate app.use('/api/movies', ...) from your original file has been removed for correctness.