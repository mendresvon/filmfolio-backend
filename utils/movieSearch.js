const MAX_SEARCH_QUERY_CODE_POINTS = 100;

function isSearchQueryTooLong(query) {
  let codePointCount = 0;

  for (const _codePoint of query) {
    codePointCount += 1;
    if (codePointCount > MAX_SEARCH_QUERY_CODE_POINTS) return true;
  }

  return false;
}

module.exports = { MAX_SEARCH_QUERY_CODE_POINTS, isSearchQueryTooLong };
