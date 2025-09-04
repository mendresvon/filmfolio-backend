const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const auth = require("../middleware/auth"); // Import our new auth middleware

const prisma = new PrismaClient();

// @route   POST /api/watchlists
// @desc    Create a new watchlist
// @access  Private
router.post("/", auth, async (req, res) => {
  const { name } = req.body;

  // Simple validation
  if (!name) {
    return res.status(400).json({ msg: "Please provide a name for the watchlist" });
  }

  try {
    // req.user.id comes from the auth middleware after decoding the JWT
    const newWatchlist = await prisma.watchlist.create({
      data: {
        name: name,
        userId: req.user.id,
      },
    });

    res.status(201).json(newWatchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
