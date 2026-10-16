import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSeries } from '../js/chart.js';

const s = (id, day, score) => ({ id, at: new Date(2026, 8, day).toISOString(), mode: 'free', metrics: { score, wpm: 140, fillersPerMinute: 1 } });

test('scoreSeries orders sessions oldest to newest', () => {
  // Storage keeps newest first; the chart needs chronological order.
  const points = scoreSeries([s('c', 3, 80), s('a', 1, 50), s('b', 2, 65)]);
  assert.deepEqual(points.map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(points.map((p) => p.score), [50, 65, 80]);
});

test('scoreSeries reads new and old score locations', () => {
  const now = { id: 'n', at: '2026-10-01T10:00:00Z', score: 77, source: 'upload', report: { items: [{ key: 'pace', value: '140', unit: 'words/min (est.)' }] } };
  const [old, fresh] = scoreSeries([now, s('o', 1, 60)]);
  assert.equal(old.score, 60);
  assert.equal(fresh.score, 77);
  assert.equal(fresh.source, 'Recording');
  assert.equal(fresh.pace, '~140');
});

test('takes made from a prompt are labeled by category', () => {
  const [p] = scoreSeries([{ id: 'p', at: '2026-10-02T10:00:00Z', score: 70, source: 'live', prompt: { category: 'persuade' } }]);
  assert.equal(p.source, 'Persuasion');
});

test('scoreSeries skips sessions without a usable score or date', () => {
  const points = scoreSeries([s('a', 1, 50), { id: 'x', at: null, metrics: { score: 10 } }, { id: 'y', at: '2026-09-02', metrics: {} }, null]);
  assert.deepEqual(points.map((p) => p.id), ['a']);
});
