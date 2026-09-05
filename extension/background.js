// Update this if the backend runs somewhere other than the default dev port.
const BACKEND_URL = 'http://localhost:3001';

// Reads the user's own LeetCode session live from their browser cookies.
// Never persisted anywhere by this extension or the backend — read fresh on
// every sync and sent straight through.
const getLeetCodeCredentials = async () => {
  const [sessionCookie, csrfCookie] = await Promise.all([
    chrome.cookies.get({ url: 'https://leetcode.com', name: 'LEETCODE_SESSION' }),
    chrome.cookies.get({ url: 'https://leetcode.com', name: 'csrftoken' }),
  ]);

  if (!sessionCookie || !csrfCookie) {
    return { error: 'not logged into LeetCode — open leetcode.com and log in first' };
  }

  return { session: sessionCookie.value, csrf: csrfCookie.value };
};

const syncNow = async () => {
  const credentials = await getLeetCodeCredentials();
  if (credentials.error) {
    return { ok: false, error: credentials.error };
  }

  const { token } = await chrome.storage.local.get('token');
  if (!token) {
    return { ok: false, error: 'not logged in — please log in first' };
  }

  let response;
  try {
    response = await fetch(`${BACKEND_URL}/api/leetcode/submissions/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ session: credentials.session, csrf: credentials.csrf }),
    });
  } catch (err) {
    return { ok: false, error: `could not reach backend: ${err.message}` };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, error: data.error || `sync failed (${response.status})` };
  }

  await chrome.storage.local.set({ lastSync: new Date().toISOString() });

  return { ok: true, published: data.published, submissions: data.submissions };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SYNC_NOW') {
    syncNow().then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  return undefined;
});
