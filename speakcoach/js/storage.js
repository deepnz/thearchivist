// Session storage with two backends behind one async interface:
//
// - "account": inside a Claude artifact, each signed-in viewer's sessions go
//   to their private db area (data/users/<id>/…), so history follows them
//   across devices and nobody else, the artifact's owner included, can read it.
// - "browser": localStorage everywhere else (the standalone app, signed-out
//   viewers, or when the account store refuses a write). Every access is
//   guarded: storage can throw when site data is blocked or the quota is full.

const SESSIONS_KEY = 'speakcoach.sessions.v1';
const APIKEY_KEY = 'speakcoach.apikey.v1';
const MAX_SESSIONS = 100;
// When browser storage is full, older sessions keep their numbers but drop the
// bulky transcript, coaching and timeline. The most recent stay complete.
const KEEP_FULL_SESSIONS = 20;
const MAX_TRANSCRIPT_CHARS = 60000;

/* ---------- browser backend ---------- */

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

function compact(session) {
  const { transcript, coaching, timeline, ...rest } = session;
  return { ...rest, trimmed: Boolean(transcript || coaching || timeline) };
}

function readLocal() {
  try {
    const sessions = JSON.parse(read(SESSIONS_KEY));
    if (!Array.isArray(sessions)) return [];
    // Sessions saved before ids existed get a stable one derived from their timestamp.
    return sessions.map((s) => (s.id ? s : { ...s, id: `legacy-${s.at}` }));
  } catch {
    return [];
  }
}

function writeLocal(sessions) {
  const capped = sessions.slice(0, MAX_SESSIONS);
  if (write(SESSIONS_KEY, JSON.stringify(capped))) return true;
  const trimmed = capped.map((s, i) => (i < KEEP_FULL_SESSIONS ? s : compact(s)));
  return write(SESSIONS_KEY, JSON.stringify(trimmed));
}

const browserBackend = {
  kind: 'browser',
  async list() { return readLocal(); },
  async get(id) { return readLocal().find((s) => s.id === id) || null; },
  async save(session) { return writeLocal([session, ...readLocal()]); },
  async update(id, patch) {
    const sessions = readLocal();
    const index = sessions.findIndex((s) => s.id === id);
    if (index === -1) return false;
    sessions[index] = { ...sessions[index], ...patch };
    return writeLocal(sessions);
  },
  async clear() { return write(SESSIONS_KEY, null); },
};

/* ---------- account backend (artifact db) ---------- */

function accountBackend(db, uid) {
  const sessions = db.doc(`data/users/${uid}/profile`).collection('sessions');
  return {
    kind: 'account',
    async list() {
      const snap = await sessions.get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async get(id) {
      const snap = await sessions.doc(id).get();
      return snap.exists ? { ...snap.data(), id } : null;
    },
    async save(session) {
      await sessions.doc(session.id).set(JSON.parse(JSON.stringify(session)));
      return true;
    },
    async update(id, patch) {
      await sessions.doc(id).update(patch);
      return true;
    },
    async clear() {
      const snap = await sessions.get();
      for (const d of snap.docs) await sessions.doc(d.id).delete();
      return true;
    },
  };
}

let backend = browserBackend;

/**
 * Chooses where sessions live. Resolves "account" or "browser". Safe to call
 * anywhere: outside a Claude artifact it resolves "browser" at once.
 */
export async function initStorage() {
  const claude = typeof window !== 'undefined' ? window.claude : undefined;
  if (!claude?.use) return backend.kind;
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (db && uid) backend = accountBackend(db, uid);
  } catch {
    backend = browserBackend;
  }
  return backend.kind;
}

export function storageKind() {
  return backend.kind;
}

// Runs an account-store call; if the store refuses (no write access, quota,
// lost grant), switches to browser storage for the rest of the visit.
async function withFallback(call) {
  try {
    return await call(backend);
  } catch {
    if (backend.kind === 'browser') return null;
    backend = browserBackend;
    try { return await call(backend); } catch { return null; }
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------- public API ---------- */

// Newest first by date.
export async function loadSessions() {
  const sessions = (await withFallback((b) => b.list())) ?? [];
  return sessions.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export async function getSession(id) {
  return withFallback((b) => b.get(id));
}

// Saves a new session and returns it (with its id), or null if it couldn't be saved.
export async function saveSession(session) {
  const stored = { id: newId(), ...session };
  if (typeof stored.transcript === 'string' && stored.transcript.length > MAX_TRANSCRIPT_CHARS) {
    stored.transcript = stored.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  }
  const ok = await withFallback((b) => b.save(stored));
  return ok ? stored : null;
}

// Merges fields into an existing session. Resolves true on success.
export async function updateSession(id, patch) {
  return Boolean(await withFallback((b) => b.update(id, patch)));
}

export async function clearSessions() {
  return Boolean(await withFallback((b) => b.clear()));
}

// The API key is only used by the standalone app; it never leaves this browser.
export function loadApiKey() {
  return read(APIKEY_KEY) || '';
}

export function saveApiKey(key) {
  return write(APIKEY_KEY, key || null);
}
