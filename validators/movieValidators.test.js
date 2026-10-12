const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMovieId } = require("./movieValidators");

test("movie IDs accept positive safe integers and digit-only strings", () => {
  for (const value of [1, 550, "550", "00550", Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)]) {
    assert.equal(parseMovieId(value), Number(value));
  }
});

test("movie IDs reject empty, malformed, non-integer, and unsafe values", () => {
  for (const value of [
    undefined, null, "", " ", "123abc", "123.5", "123.0", "1e3", "0x7b",
    "-123", "+123", " 123", "123 ", "123\n", 0, "0", -123, 123.5,
    NaN, Infinity, -Infinity, 9007199254740992, "9007199254740992",
    true, false, [], [123], {},
  ]) {
    assert.equal(parseMovieId(value), null, String(value));
  }
});
