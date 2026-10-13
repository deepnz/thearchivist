import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage with an optional byte quota.
class FakeStorage {
  constructor() { this.data = new Map(); this.quota = Infinity; }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) {
    if (String(v).length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(k, String(v));
  }
  removeItem(k) { this.data.delete(k); }
}

// Minimal stand-in for the artifact db: docs in a Map keyed by path.
function fakeDb({ failWrites = false } = {}) {
  const docs = new Map();
  const docRef = (path) => ({
    id: path.split('/').pop(),
    async get() { return { exists: docs.has(path), data: () => docs.get(path), id: path.split('/').pop() }; },
    async set(data) { if (failWrites) throw { code: 'invalid_argument' }; docs.set(path, structuredClone(data)); },
    async update(patch) { if (!docs.has(path)) throw { code: 'invalid_argument' }; docs.set(path, { ...docs.get(path), ...patch }); },
    async delete() { docs.delete(path); },
    collection: (name) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path) => ({
    doc: (id) => docRef(`${path}/${id}`),
    async get() {
      const prefix = `${path}/`;
      const found = [...docs.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'));
      return { docs: found.map((k) => ({ id: k.slice(prefix.length), exists: true, data: () => docs.get(k) })) };
    },
  });
  return { docs, doc: docRef, collection: collectionRef };
}

globalThis.localStorage = new FakeStorage();
globalThis.window = {};
let storage = await import('../js/storage.js?browser');

const metrics = { score: 70, wpm: 140, fillersPerMinute: 1, durationSeconds: 60 };
const session = (n) => ({ at: new Date(2026, 0, n).toISOString(), mode: 'free', topic: null, transcript: `talk ${n} `.repeat(50), metrics });

beforeEach(() => { globalThis.localStorage = new FakeStorage(); });

test('outside an artifact, sessions live in the browser', async () => {
  assert.equal(await storage.initStorage(), 'browser');
});

test('saveSession assigns an id and keeps the transcript', async () => {
  const saved = await storage.saveSession(session(1));
  assert.ok(saved.id);
  const loaded = await storage.getSession(saved.id);
  assert.equal(loaded.transcript, session(1).transcript);
});

test('sessions load newest first by date', async () => {
  const b = await storage.saveSession(session(2));
  const a = await storage.saveSession(session(1)); // saved later, but older date
  assert.deepEqual((await storage.loadSessions()).map((s) => s.id), [b.id, a.id]);
});

test('updateSession merges coaching into an existing session', async () => {
  const saved = await storage.saveSession(session(1));
  assert.equal(await storage.updateSession(saved.id, { coaching: 'Great opening.' }), true);
  const loaded = await storage.getSession(saved.id);
  assert.equal(loaded.coaching, 'Great opening.');
  assert.equal(loaded.transcript, session(1).transcript);
  assert.equal(await storage.updateSession('missing', { coaching: 'x' }), false);
});

test('when storage is full, older sessions drop transcripts but keep metrics', async () => {
  for (let i = 1; i <= 25; i++) await storage.saveSession(session(i));
  localStorage.quota = localStorage.getItem('speakcoach.sessions.v1').length;
  const newest = await storage.saveSession(session(26));
  assert.ok(newest, 'save should succeed after compaction');

  const sessions = await storage.loadSessions();
  assert.equal(sessions.length, 26);
  assert.equal(sessions[0].transcript, session(26).transcript);
  assert.notEqual(sessions[19].transcript, undefined);
  assert.equal(sessions[20].transcript, undefined);
  assert.equal(sessions[20].trimmed, true);
  assert.deepEqual(sessions[25].metrics, metrics);
});

test('saveSession returns null when storage is unavailable', async () => {
  localStorage.quota = 0;
  assert.equal(await storage.saveSession(session(1)), null);
});

test('sessions saved before ids existed get a stable legacy id', async () => {
  const at = new Date(2025, 5, 1).toISOString();
  localStorage.setItem('speakcoach.sessions.v1', JSON.stringify([{ at, mode: 'free', metrics }]));
  const [legacy] = await storage.loadSessions();
  assert.equal(legacy.id, `legacy-${at}`);
  assert.equal((await storage.getSession(legacy.id)).at, at);
});

test('corrupt stored data loads as an empty history', async () => {
  localStorage.setItem('speakcoach.sessions.v1', '{not json');
  assert.deepEqual(await storage.loadSessions(), []);
});

test('in an artifact with a signed-in viewer, sessions go to their private db area', async () => {
  const db = fakeDb();
  globalThis.window = { claude: { use: async (name) => (name === 'db' ? db : { id: async () => 'u_123' }) } };
  const accountStorage = await import('../js/storage.js?account');
  assert.equal(await accountStorage.initStorage(), 'account');

  const saved = await accountStorage.saveSession(session(3));
  assert.ok(db.docs.has(`data/users/u_123/profile/sessions/${saved.id}`));
  assert.equal(localStorage.getItem('speakcoach.sessions.v1'), null, 'nothing written to the browser');
  await accountStorage.updateSession(saved.id, { coaching: 'Nice.' });
  assert.equal((await accountStorage.getSession(saved.id)).coaching, 'Nice.');
  assert.equal((await accountStorage.loadSessions()).length, 1);
});

test('if the account store refuses writes, sessions fall back to the browser', async () => {
  globalThis.window = { claude: { use: async (name) => (name === 'db' ? fakeDb({ failWrites: true }) : { id: async () => 'u_1' }) } };
  const s = await import('../js/storage.js?refused');
  assert.equal(await s.initStorage(), 'account');
  const saved = await s.saveSession(session(4));
  assert.ok(saved, 'save still succeeds');
  assert.equal(s.storageKind(), 'browser');
  assert.ok(localStorage.getItem('speakcoach.sessions.v1').includes(saved.id));
});

test('a signed-out viewer (no id) uses the browser', async () => {
  globalThis.window = { claude: { use: async (name) => (name === 'db' ? fakeDb() : { id: async () => null }) } };
  const s = await import('../js/storage.js?signedout');
  assert.equal(await s.initStorage(), 'browser');
});
