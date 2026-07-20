import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize,
  findFillers,
  longestFluentStretch,
  vocabularyDiversity,
  analyze,
  tips,
} from '../js/analysis.js';

test('tokenize strips punctuation and lowercases', () => {
  assert.deepEqual(tokenize("Hello, World! It's me."), ['hello', 'world', "it's", 'me']);
});

test('tokenize handles empty and null input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

test('findFillers counts single-word fillers', () => {
  const { counts } = findFillers(tokenize('um I think um this is uh great'));
  assert.equal(counts.um, 2);
  assert.equal(counts.uh, 1);
});

test('findFillers counts phrase fillers and flags both tokens', () => {
  const tokens = tokenize('this is you know pretty good');
  const { counts, fillerFlags } = findFillers(tokens);
  assert.equal(counts['you know'], 1);
  assert.equal(fillerFlags[tokens.indexOf('you')], true);
  assert.equal(fillerFlags[tokens.indexOf('know')], true);
});

test('phrase fillers are not double-counted as single fillers', () => {
  // "sort of" contains no single fillers, but "i mean" should not also count "mean"
  const { counts } = findFillers(tokenize('i mean it was sort of fine'));
  assert.equal(counts['i mean'], 1);
  assert.equal(counts['sort of'], 1);
  assert.equal(Object.keys(counts).length, 2);
});

test('longestFluentStretch finds max run of non-fillers', () => {
  // f = filler
  assert.equal(longestFluentStretch([false, false, true, false, false, false, true]), 3);
  assert.equal(longestFluentStretch([]), 0);
  assert.equal(longestFluentStretch([true, true]), 0);
});

test('vocabularyDiversity is distinct/total', () => {
  assert.equal(vocabularyDiversity(['a', 'b', 'a', 'b']), 0.5);
  assert.equal(vocabularyDiversity([]), 0);
});

test('analyze computes WPM from duration', () => {
  const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const m = analyze(words, 60);
  assert.equal(m.wpm, 150);
  assert.equal(m.wordCount, 150);
});

test('analyze gives a perfect-ish score for clean in-band speech', () => {
  // 150 distinct words over 60s: in-band pace, zero fillers, max diversity.
  const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const m = analyze(words, 60);
  assert.equal(m.fillerCount, 0);
  assert.equal(m.score, 100);
});

test('analyze penalizes filler-heavy speech', () => {
  const clean = analyze(Array.from({ length: 150 }, (_, i) => `w${i}`).join(' '), 60);
  const heavy = analyze(
    'um uh like ' + Array.from({ length: 147 }, (_, i) => `w${i}`).join(' um '),
    60,
  );
  assert.ok(heavy.score < clean.score);
  assert.ok(heavy.fillersPerMinute > 8);
});

test('analyze of empty transcript scores zero', () => {
  const m = analyze('', 60);
  assert.equal(m.score, 0);
  assert.equal(m.wordCount, 0);
});

test('tips flags fast pace', () => {
  const words = Array.from({ length: 250 }, (_, i) => `word${i}`).join(' ');
  const t = tips(analyze(words, 60));
  assert.ok(t.some((tip) => tip.includes('faster')));
});

test('tips names the dominant filler when rate is high', () => {
  const transcript = Array.from({ length: 30 }, () => 'um point made here').join(' ');
  const t = tips(analyze(transcript, 60));
  assert.ok(t.some((tip) => tip.includes('"um"')));
});

test('tips praises zero fillers', () => {
  const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const t = tips(analyze(words, 60));
  assert.ok(t.some((tip) => tip.includes('Zero fillers')));
});
