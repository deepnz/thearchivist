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

test('scoreSeries skips sessions without a usable score or date', () => {
  const points = scoreSeries([s('a', 1, 50), { id: 'x', at: null, metrics: { score: 10 } }, { id: 'y', at: '2026-09-02', metrics: {} }, null]);
  assert.deepEqual(points.map((p) => p.id), ['a']);
});
