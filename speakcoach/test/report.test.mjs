import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, curve, status, qualityNotes } from '../js/report.js';
import { analyze } from '../js/analysis.js';

const acoustic = (over = {}) => ({
  speechFound: true,
  durationSec: 120,
  talkSec: 118,
  speakingSec: 90,
  pace: { syllables: 430, syllablesPerSec: 3.6, articulationRate: 4.8, estWpm: 150, windows: [] },
  pauses: { count: 20, perMinute: 10.2, meanSec: 0.6, longestSec: 1.4, longCount: 0, silentShare: 0.2, list: [] },
  pitch: { medianHz: 140, variabilitySt: 4, rangeSt: 9, monotoneShare: 0.1, phraseEndings: 18, risingEndShare: 0.1 },
  loudness: { meanDb: -24, emphasisDb: 4, fadingEndShare: 0.1 },
  quality: { clippedShare: 0, signalToNoiseDb: 35, speechLevelDb: -18 },
  ...over,
});

test('curve interpolates and clamps at the ends', () => {
  const pts = [[0, 0], [10, 100]];
  assert.equal(curve(pts, 5), 50);
  assert.equal(curve(pts, -3), 0);
  assert.equal(curve(pts, 50), 100);
  assert.equal(curve(pts, NaN), null);
});

test('status bands', () => {
  assert.equal(status(90), 'strong');
  assert.equal(status(60), 'fair');
  assert.equal(status(20), 'focus');
});

test('audio-only report measures delivery but not words', () => {
  const r = buildReport({ acoustic: acoustic() });
  assert.deepEqual(r.measured, ['pace', 'pauses', 'intonation', 'volume']);
  assert.equal(r.items[0].unit, 'words/min (est.)');
  assert.ok(r.score >= 90, `strong delivery should score high, got ${r.score}`);
  assert.equal(r.focus.length, 0);
});

test('a transcript makes pace exact and adds fillers and word variety', () => {
  const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const r = buildReport({ text: analyze(`um ${words}`, 60), acoustic: acoustic() });
  assert.deepEqual(r.measured, ['pace', 'pauses', 'intonation', 'volume', 'fillers', 'vocabulary']);
  const pace = r.items.find((i) => i.key === 'pace');
  assert.equal(pace.unit, 'words/min');
  assert.equal(pace.value, '151');
});

test('a monotone, rushed, run-on talk gets the right focus areas', () => {
  const r = buildReport({ acoustic: acoustic({
    pace: { syllables: 800, syllablesPerSec: 6.8, articulationRate: 7, estWpm: 230, windows: [] },
    pauses: { count: 4, perMinute: 2, meanSec: 0.3, longestSec: 0.4, longCount: 0, silentShare: 0.02, list: [] },
    pitch: { medianHz: 120, variabilitySt: 1.1, rangeSt: 2.5, monotoneShare: 0.9, phraseEndings: 6, risingEndShare: 0 },
  }) });
  const focus = r.focus.map((i) => i.key);
  assert.deepEqual([...focus].sort(), ['intonation', 'pace', 'pauses']);
  assert.ok(r.score < 50, `score ${r.score}`);
  assert.match(r.items.find((i) => i.key === 'intonation').tip, /narrow band/);
});

test('upspeak and fading sentence ends lower their scores with specific tips', () => {
  const r = buildReport({ acoustic: acoustic({
    pitch: { medianHz: 200, variabilitySt: 4, rangeSt: 9, monotoneShare: 0, phraseEndings: 10, risingEndShare: 0.8 },
    loudness: { meanDb: -24, emphasisDb: 4, fadingEndShare: 0.7 },
  }) });
  const into = r.items.find((i) => i.key === 'intonation');
  const vol = r.items.find((i) => i.key === 'volume');
  assert.ok(into.score < 100 && /ended on a rise/.test(into.tip));
  assert.ok(vol.score < 100 && /trailed off/.test(vol.tip));
});

test('every tip agrees with its score band', () => {
  // A "fair" score must never come with a "you're doing great" tip, and vice versa.
  for (const variabilitySt of [0.8, 1.5, 2.3, 2.9, 4, 8]) {
    const item = buildReport({ acoustic: acoustic({ pitch: { medianHz: 150, variabilitySt, rangeSt: variabilitySt * 2.5, monotoneShare: 0, phraseEndings: 0, risingEndShare: null } }) })
      .items.find((i) => i.key === 'intonation');
    const praises = /^Expressive/.test(item.tip);
    assert.equal(praises, item.status === 'strong', `±${variabilitySt} st: status ${item.status}, tip "${item.tip.slice(0, 40)}"`);
  }
  for (const emphasisDb of [1, 2.2, 3, 5]) {
    const item = buildReport({ acoustic: acoustic({ loudness: { meanDb: -24, emphasisDb, fadingEndShare: 0 } }) })
      .items.find((i) => i.key === 'volume');
    assert.equal(/^Good vocal energy/.test(item.tip), item.status === 'strong', `${emphasisDb} dB: status ${item.status}`);
  }
});

test('clarity comes from recognizer confidence when available', () => {
  const r = buildReport({ acoustic: acoustic(), clarity: { meanConfidence: 0.62, unclear: ['the quarterly'] } });
  const clarity = r.items.find((i) => i.key === 'clarity');
  assert.equal(clarity.status, 'focus');
  assert.match(clarity.detail, /1 phrase/);
});

test('recordings with no speech produce an empty report and a clear note', () => {
  const silent = { speechFound: false, durationSec: 30, quality: { clippedShare: 0, signalToNoiseDb: 2, speechLevelDb: -70 } };
  assert.equal(buildReport({ acoustic: silent }).items.length, 0);
  assert.match(qualityNotes(silent)[0], /No clear speech/);
});

test('quality notes flag clipping, noise and short takes', () => {
  const notes = qualityNotes(acoustic({ talkSec: 8, quality: { clippedShare: 0.01, signalToNoiseDb: 10, speechLevelDb: -20 } }));
  assert.equal(notes.length, 3);
});
