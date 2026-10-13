// Accept JSON numbers and digit-only strings, without coercing other types or
// partially parsing malformed IDs. Safe integers prevent matching rounded IDs.
function parseMovieId(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[0-9]+$/.test(value))) {
    return null;
  }

  const movieId = Number(value);
  return Number.isSafeInteger(movieId) && movieId > 0 ? movieId : null;
}

module.exports = { parseMovieId };
