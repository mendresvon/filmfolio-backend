const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  // Get token from header
  const token = req.header("Authorization");

  // Check if not token
  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  // The token format is "Bearer <token>". We need to extract just the token part.
  const tokenPart = token.split(" ")[1];
  if (!tokenPart) {
    return res.status(401).json({ msg: 'Token format is "Bearer <token>"' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);
    req.user = decoded.user; // Add the user payload to the request object
    next(); // Move on to the next middleware or the route handler
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid" });
  }
};
