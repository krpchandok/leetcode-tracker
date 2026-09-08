const fs = require('fs');
const path = require('path');

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';
const GRAPHQL_DIR = path.join(__dirname, 'graphql');

// All queries here are LeetCode's public GraphQL endpoints (daily
// challenge, a public profile's stats, the problem catalog, a public
// profile's recent accepted submissions) — no session cookie is ever
// needed or accepted. The old session/csrf-authenticated path this used to
// support existed only for the Chrome extension, which has been removed.
const queryLeetCode = async (fileName, variables = {}) => {
  const query = fs.readFileSync(path.join(GRAPHQL_DIR, fileName), 'utf-8');

  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://leetcode.com/problemset/',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

module.exports = { queryLeetCode };
