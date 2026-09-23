const test = require("node:test");
const assert = require("node:assert/strict");
const { validationResult } = require("express-validator");
const {
  createWatchlistNameValidator,
  updateWatchlistNameValidator,
} = require("./watchlistValidators");

const validate = async (validator, name) => {
  const req = { body: { name } };
  await validator.run(req);
  return { req, errors: validationResult(req).array() };
};

test("create name validator trims whitespace before requiring a value", async () => {
  const { req, errors } = await validate(createWatchlistNameValidator, "   ");
  assert.equal(req.body.name, "");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].msg, "Name is required");
});

test("create name validator stores the trimmed value", async () => {
  const { req, errors } = await validate(createWatchlistNameValidator, "  Favorites  ");
  assert.equal(req.body.name, "Favorites");
  assert.equal(errors.length, 0);
});

test("update name validator rejects whitespace-only replacements", async () => {
  const { errors } = await validate(updateWatchlistNameValidator, "   ");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].msg, "Name is required");
});
