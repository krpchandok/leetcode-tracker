const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';

const fetchCsrfToken = async () => {
  const response = await fetch(LEETCODE_GRAPHQL_URL, { method: 'GET' });
  const cookies = response.headers.getSetCookie();
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('csrftoken='));

  if (!csrfCookie) {
    throw new Error('LeetCode response did not include a csrftoken cookie');
  }

  return csrfCookie.split(';')[0].split('=')[1];
};

const buildAuthHeaders = (session, csrf) => ({
  'Cookie': `csrftoken=${csrf}; LEETCODE_SESSION=${session};`,
  'x-csrftoken': csrf,
});

module.exports = { fetchCsrfToken, buildAuthHeaders };
