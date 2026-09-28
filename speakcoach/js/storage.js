// localStorage persistence for sessions and the optional API key. Every access
// is guarded: storage can throw when site data is blocked or the quota is full,
// and that must never break the practice flow.

const SESSIONS_KEY = 'speakcoach.sessions.v1';
const APIKEY_KEY = 'speakcoach.apikey.v1';
const MAX_SESSIONS = 100;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Returns true on success, false if storage is unavailable or full.
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadSessions() {
  try {
    const sessions = JSON.parse(read(SESSIONS_KEY));
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

export function saveSession(session) {
  const sessions = [session, ...loadSessions()].slice(0, MAX_SESSIONS);
  return write(SESSIONS_KEY, JSON.stringify(sessions));
}

export function clearSessions() {
  return write(SESSIONS_KEY, null);
}

export function loadApiKey() {
  return read(APIKEY_KEY) || '';
}

export function saveApiKey(key) {
  return write(APIKEY_KEY, key || null);
}
