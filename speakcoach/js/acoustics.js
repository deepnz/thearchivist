// Acoustic analysis of speech audio. Pure functions over a mono Float32Array —
// no DOM or Web Audio — so it runs in a worker and under node --test.
//
// What it measures, and how:
// - Loudness: RMS level in dBFS over 30 ms frames every 10 ms.
// - Speech vs silence: a threshold set between the recording's noise floor and
//   its loud speech level, so it adapts to quiet and loud recordings alike.
// - Pauses: silent gaps of 250 ms or more between the first and last speech.
// - Pitch: YIN fundamental-frequency estimation on 8 kHz audio, 70–400 Hz,
//   every 20 ms of speech, cleaned of octave jumps.
// - Syllables: loudness peaks in voiced speech with a 2 dB dip between them
//   (the de Jong & Wempe 2009 method), which gives a pace estimate even when
//   there is no transcript.

export const ANALYSIS_RATE = 16000;
export const HOP_SEC = 0.01;
const WIN_SEC = 0.03;
const PITCH_EVERY = 2; // pitch on every 2nd frame (20 ms)
const MIN_PAUSE_SEC = 0.25;
const LONG_PAUSE_SEC = 2;
const F0_MIN = 70;
const F0_MAX = 400;
// Average syllables per spoken English word, used to turn a syllable rate into
// an estimated words-per-minute when there is no transcript.
export const SYLLABLES_PER_WORD = 1.45;

/* ---------- small numeric helpers ---------- */

export function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = Float64Array.from(values).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return values.length ? sum / values.length : NaN;
}

function std(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

const round = (v, digits = 1) => (Number.isFinite(v) ? +v.toFixed(digits) : null);

/* ---------- loudness and speech detection ---------- */

export function frameLoudness(samples, sampleRate) {
  const hop = Math.round(sampleRate * HOP_SEC);
  const win = Math.round(sampleRate * WIN_SEC);
  const count = samples.length < win ? 0 : Math.floor((samples.length - win) / hop) + 1;
  const db = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + win; i++) sum += samples[i] * samples[i];
    db[f] = 20 * Math.log10(Math.max(Math.sqrt(sum / win), 1e-6));
  }
  return db;
}

// Marks frames that carry speech. Returns { active, threshold, noiseFloor, speechLevel }.
export function detectSpeech(db) {
  const noiseFloor = percentile(db, 0.1);
  const speechLevel = percentile(db, 0.95);
  const span = speechLevel - noiseFloor;
  const active = new Uint8Array(db.length);
  if (!(span >= 8)) return { active, threshold: speechLevel, noiseFloor, speechLevel };

  const threshold = noiseFloor + Math.max(6, span * 0.3);
  for (let i = 0; i < db.length; i++) active[i] = db[i] >= threshold ? 1 : 0;

  // Drop isolated blips shorter than 50 ms (clicks, taps).
  const minRun = Math.round(0.05 / HOP_SEC);
  let i = 0;
  while (i < active.length) {
    if (!active[i]) { i++; continue; }
    let j = i;
    while (j < active.length && active[j]) j++;
    if (j - i < minRun) active.fill(0, i, j);
    i = j;
  }
  return { active, threshold, noiseFloor, speechLevel };
}

// Splits active frames into phrases separated by pauses of at least MIN_PAUSE_SEC.
export function segmentSpeech(active) {
  const minGap = Math.round(MIN_PAUSE_SEC / HOP_SEC);
  const runs = [];
  let i = 0;
  while (i < active.length) {
    if (!active[i]) { i++; continue; }
    let j = i;
    while (j < active.length && active[j]) j++;
    runs.push([i, j]);
    i = j;
  }
  const phrases = [];
  const pauses = [];
  for (const run of runs) {
    const last = phrases[phrases.length - 1];
    if (last && run[0] - last[1] < minGap) {
      last[1] = run[1]; // a gap too short to be a pause: same phrase
    } else {
      if (last) pauses.push([last[1], run[0]]);
      phrases.push([...run]);
    }
  }
  const toSec = ([a, b]) => ({ start: a * HOP_SEC, end: b * HOP_SEC, duration: (b - a) * HOP_SEC });
  return { phrases: phrases.map(toSec), pauses: pauses.map(toSec) };
}

/* ---------- pitch ---------- */

// Halve the sample rate with a 2-tap average (enough anti-aliasing for pitch).
function decimate2(samples) {
  const out = new Float32Array(samples.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (samples[2 * i] + samples[2 * i + 1]) * 0.5;
  return out;
}

// YIN pitch estimate for one frame; returns Hz, or 0 when the frame is unvoiced.
// `buf` must hold at least `size + sampleRate / F0_MIN` samples from `offset`.
export function yin(buf, offset, size, sampleRate, threshold = 0.15) {
  const tauMin = Math.floor(sampleRate / F0_MAX);
  const tauMax = Math.ceil(sampleRate / F0_MIN);
  if (offset + size + tauMax > buf.length) return 0;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < size; j++) {
      const diff = buf[offset + j] - buf[offset + j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalized difference.
  let running = 0;
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      // Parabolic interpolation around the minimum.
      const a = cmnd[tau - 1];
      const b = cmnd[tau];
      const c = cmnd[tau + 1];
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      return sampleRate / (tau + shift);
    }
  }
  return 0;
}

// Pitch in Hz for each loudness frame (0 = unvoiced or not measured).
export function pitchTrack(samples, sampleRate, active) {
  let signal = samples;
  let rate = sampleRate;
  while (rate >= 16000) { signal = decimate2(signal); rate /= 2; }
  const hop = rate * HOP_SEC;
  const size = Math.round(rate * 0.025);
  const raw = new Float32Array(active.length);
  for (let f = 0; f < active.length; f += PITCH_EVERY) {
    if (!active[f]) continue;
    const hz = yin(signal, Math.round(f * hop), size, rate);
    if (hz >= F0_MIN && hz <= F0_MAX) {
      raw[f] = hz;
      if (f + 1 < raw.length) raw[f + 1] = hz; // hold for the skipped frame
    }
  }
  return cleanPitch(raw);
}

// Removes octave jumps and stray points: each value is compared with the
// median of its voiced neighbours and dropped if more than 7 semitones away.
function cleanPitch(raw) {
  const out = new Float32Array(raw.length);
  const reach = 15; // ±150 ms
  for (let i = 0; i < raw.length; i++) {
    if (!raw[i]) continue;
    const near = [];
    for (let j = Math.max(0, i - reach); j <= Math.min(raw.length - 1, i + reach); j++) {
      if (raw[j]) near.push(raw[j]);
    }
    if (near.length < 3) continue; // isolated voiced frame: not reliable
    const median = percentile(near, 0.5);
    if (Math.abs(12 * Math.log2(raw[i] / median)) <= 7) out[i] = raw[i];
  }
  return out;
}

/* ---------- syllables ---------- */

function smooth(values, radius) {
  const out = new Float32Array(values.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length + radius; i++) {
    if (i < values.length) { sum += values[i]; count++; }
    if (i - 2 * radius - 1 >= 0) { sum -= values[i - 2 * radius - 1]; count--; }
    const center = i - radius;
    if (center >= 0 && center < values.length) out[center] = sum / count;
  }
  return out;
}

// Returns frame indices of syllable nuclei.
export function syllableNuclei(db, pitch, threshold, { minDipDb = 2 } = {}) {
  const s = smooth(db, 3); // ~70 ms
  const minDistance = Math.round(0.08 / HOP_SEC);
  const voicedNear = (i) => {
    for (let j = Math.max(0, i - 4); j <= Math.min(pitch.length - 1, i + 4); j++) if (pitch[j]) return true;
    return false;
  };

  const peaks = [];
  for (let i = 1; i < s.length - 1; i++) {
    if (!(s[i] > s[i - 1] && s[i] >= s[i + 1]) || s[i] < threshold + 2 || !voicedNear(i)) continue;
    const last = peaks[peaks.length - 1];
    if (last === undefined) { peaks.push(i); continue; }
    let dip = Infinity;
    for (let j = last; j <= i; j++) dip = Math.min(dip, s[j]);
    const separate = s[i] - dip >= minDipDb && s[last] - dip >= minDipDb && i - last >= minDistance;
    if (separate) peaks.push(i);
    else if (s[i] > s[last]) peaks[peaks.length - 1] = i; // same syllable, louder peak
  }
  return peaks;
}

/* ---------- higher-level measures ---------- */

function semitonesFrom(hz, reference) {
  return 12 * Math.log2(hz / reference);
}

// Pitch movement: variability, range, and how phrases end.
function intonationMeasures(pitch, phrases, medianHz) {
  const voiced = [];
  for (const hz of pitch) if (hz) voiced.push(semitonesFrom(hz, medianHz));

  // Monotone stretches: 5 s windows of speech whose pitch barely moves.
  let windows = 0;
  let flat = 0;
  const windowFrames = Math.round(5 / HOP_SEC);
  for (let start = 0; start + windowFrames <= pitch.length; start += windowFrames) {
    const st = [];
    for (let i = start; i < start + windowFrames; i++) if (pitch[i]) st.push(semitonesFrom(pitch[i], medianHz));
    if (st.length < 40) continue; // mostly silence
    windows++;
    if (std(st) < 1.5) flat++;
  }

  // Phrase endings: compare the last voiced stretch with the phrase's body.
  let endings = 0;
  let rising = 0;
  for (const phrase of phrases) {
    if (phrase.duration < 0.8) continue;
    const st = [];
    for (let i = Math.round(phrase.start / HOP_SEC); i < Math.round(phrase.end / HOP_SEC); i++) {
      if (pitch[i]) st.push(semitonesFrom(pitch[i], medianHz));
    }
    if (st.length < 20) continue;
    endings++;
    const tail = mean(st.slice(-8));
    const body = percentile(st.slice(0, Math.floor(st.length * 0.75)), 0.5);
    if (tail - body >= 2) rising++;
  }

  return {
    variabilitySt: round(std(voiced)),
    rangeSt: round(percentile(voiced, 0.9) - percentile(voiced, 0.1)),
    monotoneShare: windows ? round(flat / windows, 2) : null,
    phraseEndings: endings,
    risingEndShare: endings ? round(rising / endings, 2) : null,
  };
}

// Volume: emphasis variation, phrase-end fade, and recording level.
function loudnessMeasures(db, active, phrases) {
  const speechDb = [];
  for (let i = 0; i < db.length; i++) if (active[i]) speechDb.push(db[i]);

  // Emphasis: how much the half-second loudness level moves during speech.
  const blockFrames = Math.round(0.5 / HOP_SEC);
  const blocks = [];
  for (let start = 0; start + blockFrames <= db.length; start += blockFrames) {
    const inBlock = [];
    for (let i = start; i < start + blockFrames; i++) if (active[i]) inBlock.push(db[i]);
    if (inBlock.length >= blockFrames * 0.5) blocks.push(mean(inBlock));
  }

  let checked = 0;
  let fading = 0;
  for (const phrase of phrases) {
    if (phrase.duration < 1) continue;
    const a = Math.round(phrase.start / HOP_SEC);
    const b = Math.round(phrase.end / HOP_SEC);
    const cut = a + Math.round((b - a) * 0.75);
    const body = [];
    const tail = [];
    for (let i = a; i < b; i++) if (active[i]) (i < cut ? body : tail).push(db[i]);
    if (body.length < 10 || tail.length < 5) continue;
    checked++;
    if (mean(body) - mean(tail) >= 4) fading++;
  }

  return {
    meanDb: round(mean(speechDb)),
    emphasisDb: round(std(blocks)),
    fadingEndShare: checked ? round(fading / checked, 2) : null,
  };
}

function recordingQuality(samples, noiseFloor, speechLevel) {
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= 0.99) clipped++;
  return {
    clippedShare: round(clipped / Math.max(1, samples.length), 4),
    signalToNoiseDb: round(speechLevel - noiseFloor),
    speechLevelDb: round(speechLevel),
  };
}

// Syllable rate in sliding windows, to find rushed and dragging stretches.
function paceWindows(nuclei, startSec, endSec, windowSec = 15) {
  const out = [];
  for (let t = startSec; t + windowSec / 2 <= endSec; t += windowSec) {
    const end = Math.min(endSec, t + windowSec);
    const n = nuclei.filter((sec) => sec >= t && sec < end).length;
    out.push({ start: round(t), end: round(end), estWpm: Math.round((n / (end - t)) * 60 / SYLLABLES_PER_WORD) });
  }
  return out;
}

// Compact series for the delivery timeline: one value per `step` seconds,
// pitch as tenths of a semitone from the median, loudness as whole dB.
function timelineSeries(db, active, pitch, medianHz, durationSec) {
  const step = durationSec > 600 ? 0.5 : 0.25;
  const per = Math.round(step / HOP_SEC);
  const pitchSeries = [];
  const loudSeries = [];
  for (let start = 0; start < db.length; start += per) {
    const st = [];
    const loud = [];
    for (let i = start; i < Math.min(db.length, start + per); i++) {
      if (pitch[i]) st.push(semitonesFrom(pitch[i], medianHz));
      if (active[i]) loud.push(db[i]);
    }
    pitchSeries.push(st.length >= Math.max(2, per / 4) ? Math.round(percentile(st, 0.5) * 10) : null);
    loudSeries.push(loud.length >= per / 3 ? Math.round(mean(loud)) : null);
  }
  return { step, pitch: pitchSeries, loud: loudSeries };
}

/**
 * Full analysis of a mono recording.
 * @param {Float32Array} samples mono audio
 * @param {number} sampleRate samples per second (16 kHz recommended)
 */
export function analyzeAudio(samples, sampleRate = ANALYSIS_RATE) {
  const durationSec = samples.length / sampleRate;
  const db = frameLoudness(samples, sampleRate);
  const { active, threshold, noiseFloor, speechLevel } = detectSpeech(db);
  const { phrases, pauses } = segmentSpeech(active);

  const quality = recordingQuality(samples, noiseFloor, speechLevel);
  if (phrases.length === 0) {
    return { durationSec: round(durationSec), speechFound: false, quality };
  }

  const speechStart = phrases[0].start;
  const speechEnd = phrases[phrases.length - 1].end;
  const talkSec = speechEnd - speechStart;
  const speakingSec = phrases.reduce((sum, p) => sum + p.duration, 0);
  const pauseSec = pauses.reduce((sum, p) => sum + p.duration, 0);
  const talkMin = talkSec / 60;

  const pitch = pitchTrack(samples, sampleRate, active);
  const voicedHz = [];
  for (const hz of pitch) if (hz) voicedHz.push(hz);
  const medianHz = voicedHz.length ? percentile(voicedHz, 0.5) : null;

  const nuclei = syllableNuclei(db, pitch, threshold).map((i) => i * HOP_SEC);
  const syllables = nuclei.length;

  return {
    speechFound: true,
    durationSec: round(durationSec),
    talkSec: round(talkSec),
    speakingSec: round(speakingSec),
    pace: {
      syllables,
      syllablesPerSec: round(syllables / talkSec, 2),
      articulationRate: round(syllables / speakingSec, 2), // while actually speaking
      estWpm: Math.round(syllables / talkMin / SYLLABLES_PER_WORD),
      windows: paceWindows(nuclei, speechStart, speechEnd),
    },
    pauses: {
      count: pauses.length,
      perMinute: round(pauses.length / talkMin),
      meanSec: round(pauses.length ? pauseSec / pauses.length : 0, 2),
      longestSec: round(pauses.reduce((m, p) => Math.max(m, p.duration), 0), 2),
      longCount: pauses.filter((p) => p.duration >= LONG_PAUSE_SEC).length,
      silentShare: round(pauseSec / talkSec, 2),
      list: pauses.map((p) => ({ start: round(p.start, 2), duration: round(p.duration, 2) })),
    },
    pitch: medianHz
      ? { medianHz: Math.round(medianHz), ...intonationMeasures(pitch, phrases, medianHz) }
      : null,
    loudness: loudnessMeasures(db, active, phrases),
    phrases: phrases.length,
    quality,
    timeline: medianHz ? timelineSeries(db, active, pitch, medianHz, durationSec) : null,
  };
}
