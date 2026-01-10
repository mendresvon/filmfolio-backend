require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose"); // <--- CHANGED

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI); // <--- CHANGED
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1); // Stop app if DB fails
  }
};
connectDB();

// @route   GET /api/keep-alive
app.get("/api/keep-alive", async (req, res) => {
  try {
    // Check if Mongoose connection is ready (1 = connected)
    if (mongoose.connection.readyState === 1) {
      res.status(200).send("Database connection is active.");
    } else {
      throw new Error("Database not ready");
    }
  } catch (error) {
    res.status(500).send("Failed to activate database connection.");
  }
});

// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/watchlists", require("./routes/watchlists"));
app.use("/api/movies", require("./routes/movies"));

// Test Route
app.get("/", (req, res) => {
  res.send("FilmFolio API is running...");
});

// CLOUD PREP: Use '0.0.0.0' to listen on all network interfaces
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
