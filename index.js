require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Allow server to accept JSON data
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use("/api/auth", require("./routes/auth"));

// Test Route
app.get("/", (req, res) => {
  res.send("Cinemalist API is running...");
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
