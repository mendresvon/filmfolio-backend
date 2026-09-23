const { check } = require("express-validator");

const createWatchlistNameValidator = check("name", "Name is required").trim().notEmpty();
const updateWatchlistNameValidator = check("name", "Name is required")
  .optional()
  .trim()
  .notEmpty()
  .withMessage("Name is required")
  .isLength({ max: 100 })
  .withMessage("Name must be under 100 characters");

module.exports = {
  createWatchlistNameValidator,
  updateWatchlistNameValidator,
};
