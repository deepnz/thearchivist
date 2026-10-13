import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudio, yin, percentile, ANALYSIS_RATE } from '../js/acoustics.js';

const SR = ANALYSIS_RATE;

// Deterministic noise so tests never flake.
function rng(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
}

/**
 * Speech-like test signal: a harmonic voice whose loudness pulses once per
 * syllable, in phrases separated by silent pauses.
 * phrases: [{ sec, pauseAfter, f0: (tPhrase, phraseSec) => Hz, gain: (tPhrase, phraseSec) => 0..1 }]
 */
function synthSpeech(phrases, { syllablesPerSec = 4, lead = 0.5, noise = 0.001 } = {}) {
  const total = lead + phrases.reduce((s, p) => s + p.sec + (p.pauseAfter ?? 0), 0) + 0.5;
  const out = new Float32Array(Math.round(total * SR));
  const rand = rng();
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 * noise;
  let t0 = lead;
  for (const p of phrases) {
    let phase = 0;
    const n = Math.round(p.sec * SR);
    const start = Math.round(t0 * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f0 = p.f0 ? p.f0(t, p.sec) : 150;
      phase += (2 * Math.PI * f0) / SR;
      // Syllable envelope: deep dip between syllables (like consonants).
      const syl = 0.12 + 0.88 * Math.sin(Math.PI * ((t * syllablesPerSec) % 1)) ** 2;
      const gain = (p.gain ? p.gain(t, p.sec) : 1) * syl * 0.3;
      const voice = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase);
      out[start + i] += gain * voice;
    }
    t0 += p.sec + (p.pauseAfter ?? 0);
  }
  return out;
}

const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);

test('yin finds the pitch of a pure tone', () => {
  const rate = 8000;
  const tone = Float32Array.from({ length: 2000 }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate));
  near(yin(tone, 0, 200, rate), 220, 2, 'Hz');
});

test('silence and flat noise are reported as no speech', () => {
  const quiet = new Float32Array(SR * 3);
  assert.equal(analyzeAudio(quiet, SR).speechFound, false);
  const rand = rng(7);
  const hiss = Float32Array.from({ length: SR * 3 }, () => rand() * 0.02);
  assert.equal(analyzeAudio(hiss, SR).speechFound, false);
});

test('measures median pitch of a steady voice', () => {
  const a = analyzeAudio(synthSpeech([{ sec: 4 }]), SR);
  near(a.pitch.medianHz, 150, 4, 'median Hz');
  assert.ok(a.pitch.variabilitySt < 0.5, `variability ${a.pitch.variabilitySt}`);
});

test('finds pauses and classifies long ones', () => {
  const a = analyzeAudio(synthSpeech([
    { sec: 2, pauseAfter: 0.6 },
    { sec: 2, pauseAfter: 2.5 },
    { sec: 2 },
  ]), SR);
  assert.equal(a.pauses.count, 2);
  assert.equal(a.pauses.longCount, 1);
  near(a.pauses.longestSec, 2.5, 0.15, 'longest pause');
  near(a.talkSec, 9.1, 0.2, 'talk time');
  assert.equal(a.phrases, 3);
});

test('counts syllables close to the true rate', () => {
  // 3 phrases x 3 s at 4 syllables/s = 36 syllables.
  const a = analyzeAudio(synthSpeech([{ sec: 3, pauseAfter: 0.5 }, { sec: 3, pauseAfter: 0.5 }, { sec: 3 }]), SR);
  near(a.pace.syllables, 36, 4, 'syllables');
  near(a.pace.articulationRate, 4, 0.5, 'syllables/s while speaking');
  assert.ok(a.pace.estWpm > 100 && a.pace.estWpm < 160, `est WPM ${a.pace.estWpm}`);
});

test('a flat voice reads as monotone, a moving one does not', () => {
  const flat = analyzeAudio(synthSpeech([{ sec: 6, pauseAfter: 0.5 }, { sec: 6 }]), SR);
  const lively = analyzeAudio(synthSpeech([
    { sec: 6, pauseAfter: 0.5, f0: (t) => 150 * 2 ** ((4 * Math.sin(2 * Math.PI * 0.4 * t)) / 12) },
    { sec: 6, f0: (t) => 150 * 2 ** ((4 * Math.sin(2 * Math.PI * 0.4 * t + 1)) / 12) },
  ]), SR);
  assert.ok(flat.pitch.variabilitySt < 1, `flat variability ${flat.pitch.variabilitySt}`);
  assert.equal(flat.pitch.monotoneShare, 1);
  assert.ok(lively.pitch.variabilitySt > 2, `lively variability ${lively.pitch.variabilitySt}`);
  assert.ok(lively.pitch.rangeSt > 5, `lively range ${lively.pitch.rangeSt}`);
  assert.equal(lively.pitch.monotoneShare, 0);
});

test('detects phrases that end on a rise (upspeak)', () => {
  const rise = (t, sec) => (t > sec - 0.4 ? 150 * 2 ** ((5 * (t - (sec - 0.4)) / 0.4) / 12) : 150);
  const fall = (t, sec) => (t > sec - 0.4 ? 150 * 2 ** ((-3 * (t - (sec - 0.4)) / 0.4) / 12) : 150);
  const upspeak = analyzeAudio(synthSpeech([1, 2, 3].map(() => ({ sec: 2, pauseAfter: 0.6, f0: rise }))), SR);
  const statements = analyzeAudio(synthSpeech([1, 2, 3].map(() => ({ sec: 2, pauseAfter: 0.6, f0: fall }))), SR);
  assert.ok(upspeak.pitch.risingEndShare >= 0.66, `upspeak share ${upspeak.pitch.risingEndShare}`);
  assert.equal(statements.pitch.risingEndShare, 0);
});

test('detects phrases that fade out at the end', () => {
  const fade = (t, sec) => (t > sec * 0.75 ? 0.3 : 1); // about -10 dB in the last quarter
  const a = analyzeAudio(synthSpeech([1, 2, 3].map(() => ({ sec: 2.4, pauseAfter: 0.6, gain: fade }))), SR);
  const steady = analyzeAudio(synthSpeech([1, 2, 3].map(() => ({ sec: 2.4, pauseAfter: 0.6 }))), SR);
  assert.ok(a.loudness.fadingEndShare >= 0.66, `fading share ${a.loudness.fadingEndShare}`);
  assert.equal(steady.loudness.fadingEndShare, 0);
});

test('timeline series covers the recording at a fixed step', () => {
  const samples = synthSpeech([{ sec: 3, pauseAfter: 1 }, { sec: 3 }]);
  const a = analyzeAudio(samples, SR);
  const expected = Math.ceil((samples.length / SR) / a.timeline.step);
  near(a.timeline.pitch.length, expected, 2, 'points');
  assert.equal(a.timeline.pitch.length, a.timeline.loud.length);
  // The pause shows up as a gap in both series.
  const pauseIndex = Math.round((0.5 + 3 + 0.5) / a.timeline.step);
  assert.equal(a.timeline.loud[pauseIndex], null);
  assert.equal(a.timeline.pitch[pauseIndex], null);
});

test('flags clipping in an overdriven recording', () => {
  const loud = synthSpeech([{ sec: 3 }]).map((v) => Math.max(-1, Math.min(1, v * 8)));
  assert.ok(analyzeAudio(loud, SR).quality.clippedShare > 0.001);
});

test('percentile interpolates between ranks', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([0, 10], 0.25), 2.5);
});
