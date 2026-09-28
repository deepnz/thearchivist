// Pure speech-analysis engine. No DOM, no browser APIs — unit tested via node --test.

// Always fillers, wherever they appear.
const PURE_FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm']);

// Verbal crutches: almost always filler in unscripted speech.
const CRUTCH_WORDS = new Set(['actually', 'basically', 'literally']);

// Only fillers at the start of a clause ("So, ...", "Well, ...").
const CLAUSE_START_FILLERS = new Set(['so', 'well', 'okay']);
// ...unless followed by one of these ("so that", "well known").
const CLAUSE_START_EXCEPTIONS = {
  so: new Set(['that', 'much', 'many', 'far', 'long']),
  well: new Set(['as', 'done', 'known', 'being']),
  okay: new Set(),
};

// Only fillers at a clause boundary ("..., right?", "Right, so").
const BOUNDARY_FILLERS = new Set(['right', 'okay']);

// "like" is a verb or preposition after these words ("I'd like", "looks like").
const LIKE_NOT_FILLER_AFTER = new Set([
  'would', "i'd", "you'd", "we'd", "they'd", "he'd", "she'd", 'i', 'you', 'we', 'they',
  "don't", "didn't", "doesn't", 'to', 'feel', 'feels', 'felt', 'look', 'looks', 'looked',
  'sound', 'sounds', 'sounded', 'seem', 'seems', 'seemed', 'something', 'anything',
  'nothing', 'just', 'much', 'more', 'really',
]);

export const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of'];

// "kind of"/"sort of" is a real noun phrase after a determiner ("what kind of car").
const HEDGE_NOT_FILLER_AFTER = new Set([
  'what', 'this', 'that', 'the', 'a', 'any', 'some', 'every', 'one', 'same', 'different',
  'which', 'all', 'these', 'those', 'no', 'each', 'another', 'right', 'wrong',
]);
const HEDGE_PHRASES = new Set(['sort of', 'kind of']);

export const TARGET_WPM = { min: 130, max: 170 };

const CLAUSE_BREAK = /[.!?,;:\n…]+/;
// Keep letters/numbers from any script plus inner apostrophes and hyphens.
const NON_WORD = /[^\p{L}\p{N}'\-\s]/gu;

function tokenizeClause(clause) {
  return clause
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(NON_WORD, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);
}

export function tokenize(text) {
  return tokenizeClauses(text).tokens;
}

// Tokenize while recording which token indices start/end a clause, so
// position-sensitive fillers ("So, ...", "..., right?") can be told apart.
export function tokenizeClauses(text) {
  const tokens = [];
  const clauseStarts = new Set();
  const clauseEnds = new Set();
  for (const clause of (text || '').split(CLAUSE_BREAK)) {
    const words = tokenizeClause(clause);
    if (words.length === 0) continue;
    clauseStarts.add(tokens.length);
    tokens.push(...words);
    clauseEnds.add(tokens.length - 1);
  }
  return { tokens, clauseStarts, clauseEnds };
}

function isFillerWord(tokens, i, clauseStarts, clauseEnds) {
  const word = tokens[i];
  if (PURE_FILLERS.has(word) || CRUTCH_WORDS.has(word)) return true;

  const atStart = clauseStarts.has(i);
  const atEnd = clauseEnds.has(i);

  if (word === 'like') {
    return i === 0 || !LIKE_NOT_FILLER_AFTER.has(tokens[i - 1]);
  }
  if (CLAUSE_START_FILLERS.has(word) && atStart && !CLAUSE_START_EXCEPTIONS[word].has(tokens[i + 1])) {
    return true;
  }
  if (BOUNDARY_FILLERS.has(word) && (atStart || atEnd)) return true;
  return false;
}

// Returns { tokens, fillerFlags, counts } where fillerFlags[i] is true when
// tokens[i] is part of a filler word or phrase, and counts maps filler -> count.
// clauseStarts/clauseEnds default to treating the whole input as one clause.
export function findFillers(
  tokens,
  clauseStarts = new Set(tokens.length ? [0] : []),
  clauseEnds = new Set(tokens.length ? [tokens.length - 1] : []),
) {
  const fillerFlags = new Array(tokens.length).fill(false);
  const counts = {};
  const phrases = FILLER_PHRASES.map((p) => p.split(' '));

  for (let i = 0; i < tokens.length; i++) {
    if (fillerFlags[i]) continue;
    let matchedPhrase = false;
    for (const phrase of phrases) {
      if (i + phrase.length > tokens.length) continue;
      if (!phrase.every((w, j) => tokens[i + j] === w)) continue;
      const key = phrase.join(' ');
      if (HEDGE_PHRASES.has(key) && i > 0 && HEDGE_NOT_FILLER_AFTER.has(tokens[i - 1])) continue;
      counts[key] = (counts[key] || 0) + 1;
      for (let j = 0; j < phrase.length; j++) fillerFlags[i + j] = true;
      matchedPhrase = true;
      break;
    }
    if (!matchedPhrase && isFillerWord(tokens, i, clauseStarts, clauseEnds)) {
      counts[tokens[i]] = (counts[tokens[i]] || 0) + 1;
      fillerFlags[i] = true;
    }
  }
  return { tokens, fillerFlags, counts };
}

export function longestFluentStretch(fillerFlags) {
  let best = 0;
  let run = 0;
  for (const isFiller of fillerFlags) {
    run = isFiller ? 0 : run + 1;
    if (run > best) best = run;
  }
  return best;
}

export const DIVERSITY_WINDOW = 50;

// Moving-average type-token ratio (MATTR): the mean distinct/total ratio over
// every window of DIVERSITY_WINDOW tokens. Unlike a raw ratio it doesn't fall
// as talks get longer. Short texts fall back to the plain ratio. O(n).
export function vocabularyDiversity(tokens, window = DIVERSITY_WINDOW) {
  if (tokens.length === 0) return 0;
  if (tokens.length <= window) return new Set(tokens).size / tokens.length;

  const counts = new Map();
  let distinct = 0;
  const add = (w) => { const c = counts.get(w) || 0; if (c === 0) distinct++; counts.set(w, c + 1); };
  const remove = (w) => { const c = counts.get(w); if (c === 1) distinct--; counts.set(w, c - 1); };

  for (let i = 0; i < window; i++) add(tokens[i]);
  let sum = distinct;
  for (let i = window; i < tokens.length; i++) {
    add(tokens[i]);
    remove(tokens[i - window]);
    sum += distinct;
  }
  return sum / (tokens.length - window + 1) / window;
}

function paceScore(wpm) {
  // 40 points inside the target band, decaying linearly to 0 at 60 WPM outside it.
  if (wpm >= TARGET_WPM.min && wpm <= TARGET_WPM.max) return 40;
  const distance = wpm < TARGET_WPM.min ? TARGET_WPM.min - wpm : wpm - TARGET_WPM.max;
  return Math.max(0, Math.round(40 * (1 - distance / 60)));
}

function fillerScore(fillersPerMinute) {
  // 40 points at 0 fillers/min, 0 points at 8+/min.
  return Math.max(0, Math.round(40 * (1 - fillersPerMinute / 8)));
}

function vocabScore(diversity) {
  // 20 points at >= 0.6 diversity, scaling down linearly.
  return Math.round(20 * Math.min(1, diversity / 0.6));
}

// analyze(transcript, durationSeconds) -> metrics object
export function analyze(transcript, durationSeconds) {
  const { tokens, clauseStarts, clauseEnds } = tokenizeClauses(transcript);
  const seconds = Number.isFinite(durationSeconds) ? Math.max(durationSeconds, 1) : 1;
  const minutes = seconds / 60;
  const { fillerFlags, counts } = findFillers(tokens, clauseStarts, clauseEnds);
  const fillerCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const wordCount = tokens.length;
  const wpm = Math.round(wordCount / minutes);
  const fillersPerMinute = +(fillerCount / minutes).toFixed(1);
  const diversity = +vocabularyDiversity(tokens).toFixed(2);
  const fluentStretch = longestFluentStretch(fillerFlags);

  const score = wordCount === 0
    ? 0
    : paceScore(wpm) + fillerScore(fillersPerMinute) + vocabScore(diversity);

  return {
    wordCount,
    durationSeconds: Math.round(seconds),
    wpm,
    fillerCount,
    fillersPerMinute,
    fillerBreakdown: counts,
    vocabularyDiversity: diversity,
    longestFluentStretch: fluentStretch,
    score,
  };
}

// Rule-based tips shown alongside the numbers.
export function tips(metrics) {
  const out = [];
  if (metrics.wordCount === 0) return ['No speech detected — try again closer to the microphone.'];

  if (metrics.wpm < TARGET_WPM.min) {
    out.push(`You averaged ${metrics.wpm} WPM — a touch slow. Aim for ${TARGET_WPM.min}–${TARGET_WPM.max} WPM; try shorter pauses between sentences.`);
  } else if (metrics.wpm > TARGET_WPM.max) {
    out.push(`You averaged ${metrics.wpm} WPM — faster than the ${TARGET_WPM.min}–${TARGET_WPM.max} target. Breathe at punctuation and let key points land.`);
  } else {
    out.push(`Great pace: ${metrics.wpm} WPM sits inside the ${TARGET_WPM.min}–${TARGET_WPM.max} target band.`);
  }

  if (metrics.fillersPerMinute >= 4) {
    const top = Object.entries(metrics.fillerBreakdown).sort((a, b) => b[1] - a[1])[0];
    out.push(`${metrics.fillersPerMinute} fillers/min is high — "${top[0]}" is your go-to (${top[1]}×). Replace it with a silent pause.`);
  } else if (metrics.fillerCount > 0) {
    out.push(`${metrics.fillerCount} filler${metrics.fillerCount === 1 ? '' : 's'} total — solid control. A silent beat works even better.`);
  } else {
    out.push('Zero fillers detected — excellent fluency.');
  }

  if (metrics.wordCount >= 20 && metrics.vocabularyDiversity < 0.45) {
    out.push('Vocabulary repeated a lot — vary your word choice, especially sentence openers.');
  }

  return out;
}
