const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  // get token from header
  const token = req.header("Authorization");

  // check for token
  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  // extract token from "bearer <token>"
  const tokenPart = token.split(" ")[1];
  if (!tokenPart) {
    return res.status(401).json({ msg: 'Token format is "Bearer <token>"' });
  }

  // verify token
  try {
    const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid" });
  }
};
