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
globalThis.localStorage = new FakeStorage();

const storage = await import('../js/storage.js');

const metrics = { score: 70, wpm: 140, fillersPerMinute: 1, durationSeconds: 60 };
const session = (n) => ({ at: new Date(2026, 0, n).toISOString(), mode: 'free', topic: null, transcript: `talk ${n} `.repeat(50), metrics });

beforeEach(() => { globalThis.localStorage = new FakeStorage(); });

test('saveSession assigns an id and keeps the transcript', () => {
  const saved = storage.saveSession(session(1));
  assert.ok(saved.id);
  const loaded = storage.getSession(saved.id);
  assert.equal(loaded.transcript, session(1).transcript);
});

test('sessions are stored newest first', () => {
  const a = storage.saveSession(session(1));
  const b = storage.saveSession(session(2));
  assert.deepEqual(storage.loadSessions().map((s) => s.id), [b.id, a.id]);
});

test('updateSession merges coaching into an existing session', () => {
  const saved = storage.saveSession(session(1));
  assert.equal(storage.updateSession(saved.id, { coaching: 'Great opening.' }), true);
  const loaded = storage.getSession(saved.id);
  assert.equal(loaded.coaching, 'Great opening.');
  assert.equal(loaded.transcript, session(1).transcript);
  assert.equal(storage.updateSession('missing', { coaching: 'x' }), false);
});

test('when storage is full, older sessions drop transcripts but keep metrics', () => {
  for (let i = 1; i <= 25; i++) storage.saveSession(session(i));
  const full = localStorage.getItem('speakcoach.sessions.v1').length;
  localStorage.quota = full; // the next save no longer fits uncompacted
  const newest = storage.saveSession(session(26));
  assert.ok(newest, 'save should succeed after compaction');

  const sessions = storage.loadSessions();
  assert.equal(sessions.length, 26);
  assert.equal(sessions[0].transcript, session(26).transcript);
  assert.equal(sessions[19].transcript !== undefined, true);
  assert.equal(sessions[20].transcript, undefined);
  assert.equal(sessions[20].trimmed, true);
  assert.deepEqual(sessions[25].metrics, metrics);
});

test('saveSession returns null when storage is unavailable', () => {
  localStorage.quota = 0;
  assert.equal(storage.saveSession(session(1)), null);
});

test('sessions saved before ids existed get a stable legacy id', () => {
  const at = new Date(2025, 5, 1).toISOString();
  localStorage.setItem('speakcoach.sessions.v1', JSON.stringify([{ at, mode: 'free', metrics }]));
  const [legacy] = storage.loadSessions();
  assert.equal(legacy.id, `legacy-${at}`);
  assert.equal(storage.getSession(legacy.id).at, at);
});

test('corrupt stored data loads as an empty history', () => {
  localStorage.setItem('speakcoach.sessions.v1', '{not json');
  assert.deepEqual(storage.loadSessions(), []);
});
