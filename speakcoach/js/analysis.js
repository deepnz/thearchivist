// Pure speech-analysis engine. No DOM, no browser APIs — unit tested via node --test.

export const FILLER_WORDS = [
  'um', 'uh', 'er', 'ah', 'like', 'so', 'well', 'actually', 'basically',
  'literally', 'right', 'okay', 'hmm',
];

export const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of'];

export const TARGET_WPM = { min: 130, max: 170 };

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Returns { tokens, fillerFlags, counts } where fillerFlags[i] is true when
// tokens[i] is part of a filler word or phrase, and counts maps filler -> count.
export function findFillers(tokens) {
  const fillerFlags = new Array(tokens.length).fill(false);
  const counts = {};
  const phrases = FILLER_PHRASES.map((p) => p.split(' '));

  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of phrases) {
      if (i + phrase.length > tokens.length) continue;
      if (phrase.every((w, j) => tokens[i + j] === w)) {
        const key = phrase.join(' ');
        counts[key] = (counts[key] || 0) + 1;
        for (let j = 0; j < phrase.length; j++) fillerFlags[i + j] = true;
      }
    }
    if (!fillerFlags[i] && FILLER_WORDS.includes(tokens[i])) {
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

export function vocabularyDiversity(tokens) {
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / tokens.length;
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
  const tokens = tokenize(transcript);
  const minutes = Math.max(durationSeconds, 1) / 60;
  const { fillerFlags, counts } = findFillers(tokens);
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
    durationSeconds: Math.round(durationSeconds),
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

  if (metrics.vocabularyDiversity < 0.4) {
    out.push('Vocabulary repeated a lot — vary your word choice, especially sentence openers.');
  }

  return out;
}
