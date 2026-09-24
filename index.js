require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3001;

// Use the forwarded client IP for IP-based limits behind the Cloud Run proxy.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}
app.set("trust proxy", trustProxyHops);

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// database connection
const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB Connected");
};

// keep-alive check
app.get("/api/keep-alive", async (req, res) => {
  try {
    // check if db is ready
    if (mongoose.connection.readyState === 1) {
      res.status(200).send("Database connection is active.");
    } else {
      throw new Error("Database not ready");
    }
  } catch (error) {
    res.status(500).send("Failed to activate database connection.");
  }
});

// api routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/watchlists", require("./routes/watchlists"));
app.use("/api/movies", require("./routes/movies"));

// test route
app.get("/", (req, res) => {
  res.send("FilmFolio API is running...");
});

// Don't accept requests until MongoDB is ready.
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
