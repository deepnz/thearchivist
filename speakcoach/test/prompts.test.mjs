import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMPTS, CATEGORIES, THEMES, DIFFICULTIES, DELIVERIES, TWISTS, CATEGORY, THEME, DIFFICULTY, DELIVERY,
  pickPrompt, promptRecord,
} from '../js/prompts.js';

// Deterministic randomness for repeatable picks.
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('every prompt uses known keys and has unique, punctuated text', () => {
  const texts = new Set();
  for (const p of PROMPTS) {
    assert.ok(CATEGORY[p.category], `category ${p.category}`);
    assert.ok(THEME[p.theme], `theme ${p.theme}`);
    assert.ok(DIFFICULTY[p.difficulty], `difficulty ${p.difficulty}`);
    assert.match(p.text, /[.?!"]$/, `ends with punctuation: ${p.text}`);
    assert.ok(!texts.has(p.text), `duplicate: ${p.text}`);
    texts.add(p.text);
  }
});

test('every category has at least four prompts at every difficulty', () => {
  for (const c of CATEGORIES) {
    for (const d of DIFFICULTIES) {
      const n = PROMPTS.filter((p) => p.category === c.key && p.difficulty === d.key).length;
      assert.ok(n >= 4, `${c.label} / ${d.label}: ${n}`);
    }
  }
});

test('every theme has at least eight prompts across at least four categories', () => {
  for (const t of THEMES) {
    const matching = PROMPTS.filter((p) => p.theme === t.key);
    const categories = new Set(matching.map((p) => p.category));
    assert.ok(matching.length >= 8, `${t.label}: ${matching.length} prompts`);
    assert.ok(categories.size >= 4, `${t.label}: ${categories.size} categories`);
  }
});

test('deliveries are well formed and every category suggests real ones', () => {
  const skills = new Set(['pace', 'pauses', 'intonation', 'volume', 'fillers', 'vocabulary', 'clarity']);
  for (const d of DELIVERIES) {
    assert.ok(d.pace.min < d.pace.max, d.key);
    assert.ok(d.focus.length >= 1 && d.focus.every((k) => skills.has(k)), d.key);
  }
  for (const c of CATEGORIES) assert.ok(c.deliveries.every((k) => DELIVERY[k]), c.key);
});

test('pickPrompt honors every filter at once', () => {
  const rand = seeded(5);
  for (let i = 0; i < 50; i++) {
    const pick = pickPrompt({ category: 'story', theme: 'places', difficulty: 'standard', delivery: 'calm' }, { rand });
    assert.equal(pick.category.key, 'story');
    assert.equal(pick.theme.key, 'places');
    assert.equal(pick.difficulty.key, 'standard');
    assert.equal(pick.delivery.key, 'calm');
    assert.deepEqual(pick.relaxed, []);
  }
});

test('with delivery "any", the delivery fits the category', () => {
  const rand = seeded(9);
  for (let i = 0; i < 50; i++) {
    const pick = pickPrompt({ category: 'interview' }, { rand });
    assert.ok(CATEGORY.interview.deliveries.includes(pick.delivery.key));
  }
});

test('only Challenge prompts get a twist', () => {
  const rand = seeded(3);
  for (let i = 0; i < 30; i++) {
    const pick = pickPrompt({}, { rand });
    if (pick.difficulty.key === 'challenge') assert.ok(TWISTS.includes(pick.twist));
    else assert.equal(pick.twist, null);
  }
});

test('an impossible combination relaxes the theme first and says so', () => {
  // No workplace prompt is themed "play".
  const pick = pickPrompt({ category: 'workplace', theme: 'play', difficulty: 'challenge' }, { rand: seeded(2) });
  assert.equal(pick.category.key, 'workplace');
  assert.equal(pick.difficulty.key, 'challenge');
  assert.deepEqual(pick.relaxed, ['theme']);
});

test('the pick says how many prompts fit, so a lone match can be explained', () => {
  const only = pickPrompt({ category: 'story', theme: 'places', difficulty: 'warmup' });
  assert.equal(only.choices, 1);
  const again = pickPrompt({ category: 'story', theme: 'places', difficulty: 'warmup' }, { avoid: only.prompt });
  assert.equal(again.prompt, only.prompt);
  assert.ok(pickPrompt({ category: 'story' }).choices >= 12);
});

test('"Another prompt" never repeats the current one', () => {
  const rand = seeded(11);
  let current = pickPrompt({ category: 'occasion', difficulty: 'warmup' }, { rand }).prompt;
  for (let i = 0; i < 40; i++) {
    const next = pickPrompt({ category: 'occasion', difficulty: 'warmup' }, { avoid: current, rand }).prompt;
    assert.notEqual(next, current);
    current = next;
  }
});

test('promptRecord stores keys and text only', () => {
  const record = promptRecord(pickPrompt({ difficulty: 'challenge' }, { rand: seeded(4) }));
  assert.deepEqual(Object.keys(record).sort(), ['category', 'delivery', 'difficulty', 'text', 'theme', 'twist']);
  assert.equal(typeof record.category, 'string');
  assert.ok(record.twist);
});
