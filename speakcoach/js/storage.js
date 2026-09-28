// localStorage persistence for sessions and the optional API key. Every access
// is guarded: storage can throw when site data is blocked or the quota is full,
// and that must never break the practice flow.

const SESSIONS_KEY = 'speakcoach.sessions.v1';
const APIKEY_KEY = 'speakcoach.apikey.v1';
const MAX_SESSIONS = 100;
// When storage is full, older sessions keep their metrics but drop the bulky
// transcript and coaching text. The most recent ones stay fully reviewable.
const KEEP_FULL_SESSIONS = 20;

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

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function compact(session) {
  const { transcript, coaching, ...rest } = session;
  return { ...rest, trimmed: Boolean(transcript || coaching) };
}

// Writes sessions (newest first), compacting older entries if the quota is hit.
function writeSessions(sessions) {
  const capped = sessions.slice(0, MAX_SESSIONS);
  if (write(SESSIONS_KEY, JSON.stringify(capped))) return true;
  const trimmed = capped.map((s, i) => (i < KEEP_FULL_SESSIONS ? s : compact(s)));
  return write(SESSIONS_KEY, JSON.stringify(trimmed));
}

export function loadSessions() {
  try {
    const sessions = JSON.parse(read(SESSIONS_KEY));
    if (!Array.isArray(sessions)) return [];
    // Sessions saved before ids existed get a stable one derived from their timestamp.
    return sessions.map((s) => (s.id ? s : { ...s, id: `legacy-${s.at}` }));
  } catch {
    return [];
  }
}

export function getSession(id) {
  return loadSessions().find((s) => s.id === id) || null;
}

// Saves a new session and returns it (with its id), or null if it couldn't be saved.
export function saveSession(session) {
  const stored = { id: newId(), ...session };
  return writeSessions([stored, ...loadSessions()]) ? stored : null;
}

// Merges fields into an existing session. Returns true on success.
export function updateSession(id, patch) {
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) return false;
  sessions[index] = { ...sessions[index], ...patch };
  return writeSessions(sessions);
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
