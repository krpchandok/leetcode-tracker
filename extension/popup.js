const BACKEND_URL = 'http://localhost:3001';

const loginView = document.getElementById('login-view');
const signupView = document.getElementById('signup-view');
const syncView = document.getElementById('sync-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const signupForm = document.getElementById('signup-form');
const signupError = document.getElementById('signup-error');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');
const syncButton = document.getElementById('sync-button');
const lastSyncEl = document.getElementById('last-sync');
const syncMessageEl = document.getElementById('sync-message');
const recentListEl = document.getElementById('recent-list');

const renderRecentSubmissions = (submissions) => {
  recentListEl.innerHTML = '';
  (submissions || []).forEach((submission) => {
    const li = document.createElement('li');

    const titleSpan = document.createElement('span');
    titleSpan.textContent = submission.title;

    const statusSpan = document.createElement('span');
    statusSpan.textContent = submission.statusDisplay;
    statusSpan.className = submission.statusDisplay === 'Accepted' ? 'status-accepted' : 'status-other';

    li.append(titleSpan, statusSpan);
    recentListEl.appendChild(li);
  });
};

const formatLastSync = (iso) =>
  iso ? `Last synced: ${new Date(iso).toLocaleString()}` : 'Never synced yet';

const showSyncView = async () => {
  loginView.hidden = true;
  signupView.hidden = true;
  syncView.hidden = false;
  const { lastSync } = await chrome.storage.local.get('lastSync');
  lastSyncEl.textContent = formatLastSync(lastSync);
};

const showLoginView = () => {
  syncView.hidden = true;
  signupView.hidden = true;
  loginView.hidden = false;
};

const showSignupView = () => {
  syncView.hidden = true;
  loginView.hidden = true;
  signupView.hidden = false;
};

showSignupLink.addEventListener('click', (event) => {
  event.preventDefault();
  showSignupView();
});

showLoginLink.addEventListener('click', (event) => {
  event.preventDefault();
  showLoginView();
});

const init = async () => {
  const { token } = await chrome.storage.local.get('token');
  if (token) {
    await showSyncView();
  } else {
    showLoginView();
  }
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (response.status === 401) {
      throw new Error('Invalid username or password');
    }
    if (!response.ok) {
      throw new Error(`Login failed (${response.status}). Please try again.`);
    }

    const data = await response.json();
    await chrome.storage.local.set({ token: data.token, username: data.username, userId: data.id });
    await showSyncView();
  } catch (err) {
    loginError.textContent = err.message || 'Invalid username or password';
    loginError.hidden = false;
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signupError.hidden = true;

  const username = document.getElementById('signup-username').value;
  const password = document.getElementById('signup-password').value;

  try {
    const registerResponse = await fetch(`${BACKEND_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!registerResponse.ok) {
      const registerData = await registerResponse.json().catch(() => ({}));
      throw new Error(registerData.error || 'could not create account');
    }

    const loginResponse = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!loginResponse.ok) {
      throw new Error('account created, but log in failed — try logging in manually');
    }

    const data = await loginResponse.json();
    await chrome.storage.local.set({ token: data.token, username: data.username, userId: data.id });
    await showSyncView();
  } catch (err) {
    signupError.textContent = err.message || 'Could not create account';
    signupError.hidden = false;
  }
});

syncButton.addEventListener('click', () => {
  syncButton.disabled = true;
  syncMessageEl.textContent = 'Syncing...';
  syncMessageEl.className = '';

  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, async (result) => {
    syncButton.disabled = false;

    if (!result || !result.ok) {
      syncMessageEl.textContent = result?.error || 'Sync failed.';
      syncMessageEl.className = 'error';
      renderRecentSubmissions([]);
      return;
    }

    syncMessageEl.textContent = `Synced ${result.published} submission(s).`;
    syncMessageEl.className = 'success';
    renderRecentSubmissions(result.submissions);
    const { lastSync } = await chrome.storage.local.get('lastSync');
    lastSyncEl.textContent = formatLastSync(lastSync);
  });
});

init();
