// localStorage persistence for sessions and the optional API key.

const SESSIONS_KEY = 'speakcoach.sessions.v1';
const APIKEY_KEY = 'speakcoach.apikey.v1';
const MAX_SESSIONS = 100;

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveSession(session) {
  const sessions = loadSessions();
  sessions.unshift(session);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

export function clearSessions() {
  localStorage.removeItem(SESSIONS_KEY);
}

export function loadApiKey() {
  return localStorage.getItem(APIKEY_KEY) || '';
}

export function saveApiKey(key) {
  if (key) localStorage.setItem(APIKEY_KEY, key);
  else localStorage.removeItem(APIKEY_KEY);
}
