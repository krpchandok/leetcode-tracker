const fs = require('fs');
const path = require('path');
const { buildAuthHeaders } = require('./credential.js');

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';
const GRAPHQL_DIR = path.join(__dirname, 'graphql');

const queryLeetCode = async (fileName, variables = {}, auth) => {
  const query = fs.readFileSync(path.join(GRAPHQL_DIR, fileName), 'utf-8');

  const headers = {
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com/problemset/',
  };

  if (auth) {
    Object.assign(headers, buildAuthHeaders(auth.session, auth.csrf));
  }

  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

module.exports = { queryLeetCode };
