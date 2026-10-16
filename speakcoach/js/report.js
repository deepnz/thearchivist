// Turns measurements into the delivery report card: one entry per skill with a
// 0–100 score, a status, the measured value in its real unit, and a tip.
// Pure — no DOM — and unit tested.
//
// Inputs (all optional except one of text/acoustic):
//   text     — transcript metrics from analysis.js analyze()
//   acoustic — audio measurements from acoustics.js analyzeAudio()
//   clarity  — { meanConfidence, unclear: [phrase…] } from live recognition

import { TARGET_WPM } from './analysis.js';

// How much each skill counts toward the overall score. Only the skills that
// could be measured for a session take part, re-normalized to 100%.
const WEIGHTS = {
  pace: 20, pauses: 15, intonation: 20, volume: 10, fillers: 20, vocabulary: 5, clarity: 10,
};

// Piecewise-linear scoring curve through [x, score] points.
export function curve(points, x) {
  if (!Number.isFinite(x)) return null;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export function status(score) {
  if (score >= 80) return 'strong';
  if (score >= 55) return 'fair';
  return 'focus';
}

// delivery (optional): a style from prompts.js; its pace band replaces the default.
function paceItem(text, acoustic, delivery) {
  const exact = text && text.wordCount > 0;
  const wpm = exact ? text.wpm : acoustic?.pace?.estWpm;
  if (!Number.isFinite(wpm) || wpm <= 0) return null;
  const { min, max } = delivery?.pace ?? TARGET_WPM;
  const band = delivery ? `your ${delivery.label} target of ${min}–${max}` : `the ${min}–${max} range listeners follow comfortably`;
  const distance = wpm < min ? min - wpm : wpm > max ? wpm - max : 0;
  const score = clamp(100 * (1 - distance / 60));

  const windows = acoustic?.pace?.windows ?? [];
  const rushed = windows.filter((w) => w.estWpm > max + 25);
  let tip;
  if (wpm > max) tip = `You averaged about ${wpm} words a minute, faster than ${band}. Pause at each full stop and let key points land.`;
  else if (wpm < min) tip = `You averaged about ${wpm} words a minute, slower than ${band}. Shorten the gaps inside sentences and keep the pauses for the ends of ideas.`;
  else tip = `On pace: about ${wpm} words a minute, inside ${band}.`;
  if (rushed.length && wpm <= max) {
    const at = rushed.map((w) => formatClock(w.start)).slice(0, 3).join(', ');
    tip += ` You sped up around ${at}; that's often where nerves or a well-known part of the talk takes over.`;
  }
  return {
    key: 'pace',
    label: 'Pace',
    score,
    value: `${wpm}`,
    unit: exact ? 'words/min' : 'words/min (est.)',
    detail: exact
      ? `${text.wordCount} words in ${formatClock(text.durationSeconds)}`
      : `${acoustic.pace.syllablesPerSec} syllables/s overall, ${acoustic.pace.articulationRate}/s while speaking`,
    tip,
  };
}

function pausesItem(acoustic) {
  const p = acoustic?.pauses;
  if (!p || !acoustic.talkSec || acoustic.talkSec < 10) return null;
  let score = 100;
  const notes = [];
  if (p.perMinute < 5) {
    score -= (5 - p.perMinute) * 12;
    notes.push(`Only ${p.perMinute} pauses a minute: ideas run together. Add a beat of silence after each main point.`);
  }
  if (p.silentShare > 0.35) {
    score -= (p.silentShare - 0.35) * 200;
    notes.push(`${Math.round(p.silentShare * 100)}% of your talk was silence. Plan your next sentence before you finish this one so the gaps stay short.`);
  }
  const longPerMin = p.longCount / (acoustic.talkSec / 60);
  if (longPerMin > 0.5) {
    score -= Math.min(35, (longPerMin - 0.5) * 25);
    notes.push(`${p.longCount} pauses ran past 2 seconds (longest ${p.longestSec}s). Long silences read as lost place; a short pause plus a bridging phrase keeps people with you.`);
  }
  if (notes.length === 0) notes.push(`Good use of silence: ${p.perMinute} pauses a minute, mostly short, and under a third of your time quiet.`);
  return {
    key: 'pauses',
    label: 'Pauses',
    score: clamp(score),
    value: `${p.perMinute}`,
    unit: 'per minute',
    detail: `${p.count} pauses, average ${p.meanSec}s, longest ${p.longestSec}s`,
    tip: notes.join(' '),
  };
}

function intonationItem(acoustic) {
  const pitch = acoustic?.pitch;
  if (!pitch || !Number.isFinite(pitch.variabilitySt)) return null;
  let score = curve([[0.5, 10], [1, 25], [2, 60], [3, 88], [3.5, 100], [6.5, 100], [9, 75]], pitch.variabilitySt);
  const notes = [];
  // The tip follows the score band, so advice and score always agree.
  const band = status(score);
  if (pitch.variabilitySt > 7 && band !== 'strong') {
    notes.push('Your pitch swings a lot. Variety helps, but save the big moves for emphasis so they still stand out.');
  } else if (band === 'focus') {
    notes.push(`Your pitch stayed within a narrow band (±${pitch.variabilitySt} semitones), which can sound flat. Lift your voice on the word that matters in each sentence, and drop it at the end.`);
  } else if (band === 'fair') {
    notes.push(`Some pitch movement (±${pitch.variabilitySt} semitones), but it could do more work. Pick the key word in each sentence and lift it clearly above the rest.`);
  } else {
    notes.push(`Expressive pitch: about ${pitch.rangeSt} semitones of range, which keeps a listener's attention.`);
  }
  if (pitch.monotoneShare !== null && pitch.monotoneShare >= 0.4 && pitch.variabilitySt >= 2) {
    notes.push(`${Math.round(pitch.monotoneShare * 100)}% of your talk had flat stretches; those are the parts to rehearse with more color.`);
  }
  if (pitch.risingEndShare !== null && pitch.risingEndShare > 0.35 && pitch.phraseEndings >= 3) {
    score -= (pitch.risingEndShare - 0.35) * 60;
    notes.push(`${Math.round(pitch.risingEndShare * 100)}% of your sentences ended on a rise, which can make statements sound like questions. Bring the pitch down at the end of claims.`);
  }
  return {
    key: 'intonation',
    label: 'Intonation',
    score: clamp(score),
    value: `±${pitch.variabilitySt}`,
    unit: 'semitones',
    detail: `median ${pitch.medianHz} Hz, ${pitch.rangeSt} semitone range`,
    tip: notes.join(' '),
  };
}

function volumeItem(acoustic) {
  const loud = acoustic?.loudness;
  if (!loud || !Number.isFinite(loud.emphasisDb)) return null;
  let score = curve([[0.5, 30], [1.5, 55], [2.5, 85], [3, 100], [7, 100], [10, 80]], loud.emphasisDb);
  const notes = [];
  const band = status(score);
  if (band === 'focus') notes.push('Your volume barely changed. Get a little louder for key points and softer for asides; contrast is what signals importance.');
  else if (band === 'fair') notes.push(`Some volume variation (${loud.emphasisDb} dB). Make key points noticeably louder so they stand apart from the rest.`);
  else notes.push(`Good vocal energy: your volume moved about ${loud.emphasisDb} dB to mark emphasis.`);
  if (loud.fadingEndShare !== null && loud.fadingEndShare > 0.3) {
    score -= (loud.fadingEndShare - 0.3) * 80;
    notes.push(`${Math.round(loud.fadingEndShare * 100)}% of your sentences trailed off in volume. Keep breath for the last words; that's usually where the point is.`);
  }
  return {
    key: 'volume',
    label: 'Volume & energy',
    score: clamp(score),
    value: `${loud.emphasisDb}`,
    unit: 'dB variation',
    detail: loud.fadingEndShare !== null ? `${Math.round(loud.fadingEndShare * 100)}% of sentences fade at the end` : 'emphasis measured across the talk',
    tip: notes.join(' '),
  };
}

function fillersItem(text) {
  if (!text || text.wordCount < 10) return null;
  const score = clamp(100 * (1 - text.fillersPerMinute / 8));
  const top = Object.entries(text.fillerBreakdown).sort((a, b) => b[1] - a[1])[0];
  let tip;
  if (text.fillerCount === 0) tip = 'No filler words detected. Excellent fluency.';
  else if (text.fillersPerMinute >= 4) tip = `${text.fillersPerMinute} fillers a minute; "${top[0]}" is your go-to (${top[1]}×). Swap it for a silent pause: it feels long to you and sounds confident to them.`;
  else tip = `${text.fillerCount} filler${text.fillerCount === 1 ? '' : 's'} in total, which is good control. A silent beat works even better.`;
  return {
    key: 'fillers',
    label: 'Filler words',
    score,
    value: `${text.fillersPerMinute}`,
    unit: 'per minute',
    detail: `${text.fillerCount} total`,
    tip,
  };
}

function vocabularyItem(text) {
  if (!text || text.wordCount < 40) return null;
  const score = clamp(100 * Math.min(1, text.vocabularyDiversity / 0.6));
  return {
    key: 'vocabulary',
    label: 'Word variety',
    score,
    value: `${Math.round(text.vocabularyDiversity * 100)}%`,
    unit: 'distinct words',
    detail: `${text.longestFluentStretch} words in your longest filler-free run`,
    tip: score >= 80
      ? 'Varied wording that keeps the talk fresh.'
      : 'You repeat the same words often. Vary sentence openers and find a second way to say your key term.',
  };
}

function clarityItem(clarity) {
  if (!clarity || !Number.isFinite(clarity.meanConfidence)) return null;
  const score = clamp(curve([[0.5, 20], [0.7, 60], [0.85, 90], [0.92, 100]], clarity.meanConfidence));
  const unclear = clarity.unclear ?? [];
  return {
    key: 'clarity',
    label: 'Clarity',
    score,
    value: `${Math.round(clarity.meanConfidence * 100)}%`,
    unit: 'recognized clearly',
    detail: unclear.length ? `${unclear.length} phrase${unclear.length === 1 ? '' : 's'} hard to make out` : 'every phrase recognized confidently',
    tip: unclear.length
      ? `The speech recognizer struggled with ${unclear.length === 1 ? 'one phrase' : 'some phrases'} (underlined in the transcript). Open your mouth more on vowels and finish word endings, especially when you speed up.`
      : 'Your words came through clearly.',
  };
}

export function formatClock(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// How well a take matched the delivery style it set out to practice: the
// average of that style's focus skills that could be measured.
function deliveryGoal(delivery, items) {
  if (!delivery) return null;
  const measured = delivery.focus.map((key) => items.find((i) => i.key === key)).filter(Boolean);
  if (measured.length === 0) {
    return { key: delivery.key, label: delivery.label, cue: delivery.cue, items: [], score: null, verdict: 'unmeasured' };
  }
  const score = Math.round(measured.reduce((sum, i) => sum + i.score, 0) / measured.length);
  return {
    key: delivery.key,
    label: delivery.label,
    cue: delivery.cue,
    items: measured.map((i) => ({ key: i.key, label: i.label, score: i.score, status: i.status })),
    score,
    verdict: score >= 80 ? 'hit' : score >= 55 ? 'close' : 'missed',
  };
}

/**
 * Builds the delivery report.
 * delivery (optional): the style being practiced (from prompts.js DELIVERIES);
 * it sets the pace target and adds a deliveryGoal verdict.
 * @returns {{ score: number, items: object[], focus: object[], strengths: object[], measured: string[], deliveryGoal: object|null }}
 */
export function buildReport({ text = null, acoustic = null, clarity = null, delivery = null } = {}) {
  const usableAcoustic = acoustic?.speechFound ? acoustic : null;
  const items = [
    paceItem(text, usableAcoustic, delivery),
    pausesItem(usableAcoustic),
    intonationItem(usableAcoustic),
    volumeItem(usableAcoustic),
    fillersItem(text),
    vocabularyItem(text),
    clarityItem(clarity),
  ].filter(Boolean);
  for (const item of items) item.status = status(item.score);

  const totalWeight = items.reduce((sum, i) => sum + WEIGHTS[i.key], 0);
  const score = totalWeight
    ? Math.round(items.reduce((sum, i) => sum + i.score * WEIGHTS[i.key], 0) / totalWeight)
    : 0;

  const byScore = [...items].sort((a, b) => a.score - b.score || WEIGHTS[b.key] - WEIGHTS[a.key]);
  return {
    score,
    items,
    focus: byScore.filter((i) => i.score < 85).slice(0, 3),
    strengths: byScore.reverse().filter((i) => i.score >= 85).slice(0, 2),
    measured: items.map((i) => i.key),
    deliveryGoal: deliveryGoal(delivery, items),
  };
}

// Notes about the recording itself (not the speaker), shown above the results.
export function qualityNotes(acoustic) {
  if (!acoustic) return [];
  const q = acoustic.quality ?? {};
  const notes = [];
  if (!acoustic.speechFound) {
    notes.push('No clear speech was found in this recording. Check that it has audio and that you are close to the microphone.');
    return notes;
  }
  if (q.clippedShare > 0.001) notes.push('Parts of the recording are distorted (too loud for the microphone). Move back a little or lower the input volume; pitch and volume results may be less accurate.');
  if (q.signalToNoiseDb !== null && q.signalToNoiseDb < 15) notes.push('There is a lot of background noise, so pauses and syllables may be miscounted. A quieter room gives more reliable results.');
  if (q.speechLevelDb !== null && q.speechLevelDb < -45) notes.push('The recording is very quiet. Move closer to the microphone next time.');
  if (acoustic.talkSec < 15) notes.push('This recording is short. Speak for at least 30 seconds for reliable pace and pause numbers.');
  return notes;
}
