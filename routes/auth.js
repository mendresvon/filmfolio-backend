const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // <--- Import Mongoose Model

// @route   POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Check if user exists (Mongoose syntax)
    let user = await User.findOne({ email }); // <--- CHANGED
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }

    // 2. Hash password (Same as before)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Create User (Mongoose syntax)
    user = new User({
      email,
      password: hashedPassword,
    });
    await user.save(); // <--- CHANGED

    res.status(201).json({ msg: "User registered successfully", userId: user.id });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find User (Mongoose syntax)
    const user = await User.findOne({ email }); // <--- CHANGED
    if (!user) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // 2. Compare password (Same as before)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // 3. Sign Token (Same as before)
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5h" }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
