import { analyze } from './analysis.js';
import { speechSupported, Transcriber } from './transcription.js';
import { decodeAudio, runAnalysis, LiveRecorder, microphoneAvailable, MAX_FILE_BYTES, MAX_ANALYSIS_SEC } from './audio-input.js';
import { buildReport, qualityNotes, formatClock } from './report.js';
import { SYLLABLES_PER_WORD } from './acoustics.js';
import { renderTimeline } from './timeline.js';
import { coachingMode, getCoaching } from './coach.js';
import {
  initStorage, storageKind, loadSessions, getSession, saveSession, updateSession, clearSessions, loadApiKey, saveApiKey,
} from './storage.js';
import {
  CATEGORIES, THEMES, DIFFICULTIES, DELIVERIES, CATEGORY, DIFFICULTY, DELIVERY, pickPrompt, promptRecord,
} from './prompts.js';
import { renderScoreChart, sessionScore, sessionSource, sessionPace } from './chart.js';
import { EXAMPLE_SESSION } from './example.js';

const $ = (id) => document.getElementById(id);
const inArtifact = typeof window.claude?.use === 'function';

const views = ['setup', 'recording', 'processing', 'results', 'history'].reduce((acc, name) => {
  acc[name] = $(`view-${name}`);
  return acc;
}, {});

const state = {
  mode: 'free', // 'free' (own talk) or 'prompt'
  targetSeconds: 120,
  pick: null, // current prompt from pickPrompt()
  prepInterval: null,
  file: null,
  recording: false,
  recorder: null,
  transcriber: null,
  startedAt: 0,
  timerInterval: null,
  wakeLock: null,
  current: null, // session on the results view
  audioUrl: null, // object URL for playback of the current take
  timelineControl: null,
  coachAbort: null,
};

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  $('nav-practice').classList.toggle('active', name !== 'history');
  $('nav-history').classList.toggle('active', name === 'history');
  window.scrollTo(0, 0);
}

function setBusy(busy) {
  state.recording = busy;
  $('nav-practice').disabled = busy;
  $('nav-history').disabled = busy;
}

function showMessage(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

/* ================= Setup ================= */

function setMode(mode) {
  state.mode = mode;
  for (const b of $('mode-picker').children) b.classList.toggle('active', b.dataset.mode === mode);
  $('prompt-panel').hidden = mode !== 'prompt';
  if (mode === 'prompt' && !state.pick) newPrompt();
  if (mode !== 'prompt') stopPrep();
}

$('mode-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (btn) setMode(btn.dataset.mode);
});

function setTarget(seconds) {
  state.targetSeconds = seconds;
  for (const b of $('duration-picker').children) b.classList.toggle('active', Number(b.dataset.seconds) === seconds);
}

$('duration-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-seconds]');
  if (btn) setTarget(Number(btn.dataset.seconds));
});

/* ----- Prompt picker ----- */

const FILTERS = ['category', 'theme', 'difficulty', 'delivery'];
const FILTER_OPTIONS = { category: CATEGORIES, theme: THEMES, difficulty: DIFFICULTIES, delivery: DELIVERIES };
const FILTER_ANY = { category: 'Any category', theme: 'Any theme', difficulty: 'Any difficulty', delivery: 'Suggested for the category' };
const FILTERS_KEY = 'speakcoach.promptFilters.v1';

function readFilters() {
  return Object.fromEntries(FILTERS.map((f) => [f, $(`filter-${f}`).value]));
}

// Filter choices are a per-viewer convenience: remembered in this browser.
for (const f of FILTERS) {
  const select = $(`filter-${f}`);
  select.append(new Option(FILTER_ANY[f], 'any'), ...FILTER_OPTIONS[f].map((o) => new Option(o.label, o.key)));
  select.addEventListener('change', () => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(readFilters())); } catch { /* optional */ }
    newPrompt();
  });
}
try {
  const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}');
  for (const f of FILTERS) if (saved[f] && [...$(`filter-${f}`).options].some((o) => o.value === saved[f])) $(`filter-${f}`).value = saved[f];
} catch { /* optional */ }

function newPrompt() {
  const filters = readFilters();
  state.pick = pickPrompt(filters, { avoid: state.pick?.prompt });
  renderPrompt(state.pick, filters);
}

function renderPrompt(pick, filters) {
  stopPrep();
  $('tag-category').textContent = pick.category.label;
  $('tag-theme').textContent = pick.theme.label;
  $('tag-difficulty').textContent = pick.difficulty.label;
  $('prompt-text').textContent = pick.prompt;

  const note = pick.relaxed.length
    ? `No ${CATEGORY[filters.category]?.label ?? ''} prompt matches every filter, so this one has a different ${pick.relaxed.join(' and ')}.`
    : pick.choices === 1 ? 'This is the only prompt that fits these filters. Set one to "Any" for more.' : '';
  $('prompt-relaxed').hidden = !note;
  $('prompt-relaxed').textContent = note;

  $('delivery-label').textContent = `${pick.delivery.label}.`;
  $('delivery-cue').textContent = pick.delivery.cue;
  $('delivery-pace').textContent = `${pick.delivery.pace.min}–${pick.delivery.pace.max} words/min`;
  $('plan-prep').textContent = pick.difficulty.prepSec ? `${formatClock(pick.difficulty.prepSec)} to plan your points` : 'None: start speaking right away';
  $('plan-length').textContent = `About ${pick.difficulty.lengthSec / 60} minute${pick.difficulty.lengthSec === 60 ? '' : 's'}`;
  $('twist-row').hidden = !pick.twist;
  $('plan-twist').textContent = pick.twist ?? '';
  $('prep-btn').hidden = !pick.difficulty.prepSec;
  $('prep-btn').textContent = `Start ${formatClock(pick.difficulty.prepSec)} prep timer`;
  setTarget(pick.difficulty.lengthSec);
}

function stopPrep() {
  clearInterval(state.prepInterval);
  state.prepInterval = null;
  $('prep-timer').hidden = true;
  $('prep-timer').classList.remove('done');
}

$('new-prompt-btn').addEventListener('click', newPrompt);

$('prep-btn').addEventListener('click', () => {
  if (!state.pick) return;
  stopPrep();
  const ends = performance.now() + state.pick.difficulty.prepSec * 1000;
  const timer = $('prep-timer');
  timer.hidden = false;
  const tick = () => {
    const left = Math.ceil((ends - performance.now()) / 1000);
    if (left > 0) { timer.textContent = formatClock(left); return; }
    stopPrep();
    timer.hidden = false;
    timer.classList.add('done');
    timer.textContent = 'Time to speak.';
    $('start-btn').focus();
  };
  tick();
  state.prepInterval = setInterval(tick, 250);
});

// The prompt and delivery style a new take was made with (null for own talks).
function currentPrompt() {
  return state.mode === 'prompt' && state.pick ? promptRecord(state.pick) : null;
}

function deliveryFor(prompt) {
  return prompt ? DELIVERY[prompt.delivery] ?? null : null;
}

// Phones get a direct "record with your recorder app" option.
if (window.matchMedia?.('(pointer: coarse)').matches) $('capture-btn').hidden = false;

/* ================= Live recording ================= */

function micUnavailableMessage(err) {
  if (inArtifact) {
    return "This shared page can't use your microphone. Record a voice memo on your phone or computer, then upload it under \"Analyze a recording\". The report is the same.";
  }
  if (!microphoneAvailable()) {
    return "This browser can't record audio. Upload a recording instead, or try Chrome, Edge, Safari or Firefox.";
  }
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    return "Microphone access was blocked. Allow it in your browser's site settings and try again, or upload a recording instead.";
  }
  if (err?.name === 'NotFoundError') return 'No microphone was found. Connect one, or upload a recording instead.';
  return `Couldn't start the microphone (${err?.message || 'unknown error'}). Upload a recording instead.`;
}

const live = {
  pitchPoints: [], // { t, hz }
  canvas: $('pitch-canvas'),
  draw() {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const now = (performance.now() - state.startedAt) / 1000;
    const pts = this.pitchPoints.filter((p) => p.t > now - 8);
    this.pitchPoints = pts;
    if (pts.length < 2) return;
    const hzs = pts.map((p) => p.hz).sort((a, b) => a - b);
    const median = hzs[Math.floor(hzs.length / 2)];
    const y = (hz) => h / 2 - (12 * Math.log2(hz / median)) / 10 * (h / 2 - 6);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--pitch').trim() || '#2a78d6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let prev = null;
    for (const p of pts) {
      const px = w - ((now - p.t) / 8) * w;
      const py = Math.max(4, Math.min(h - 4, y(p.hz)));
      if (prev && p.t - prev.t < 0.15) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      prev = p;
    }
    ctx.stroke();
  },
  onLevel({ db, hz, syllablesPerSec }) {
    // -60 dBFS (silent) .. -6 dBFS (very loud) mapped onto the bar.
    const pct = Math.max(0, Math.min(100, ((db + 60) / 54) * 100));
    $('level-fill').style.width = `${pct}%`;
    $('level-note').textContent = db < -50 ? 'quiet' : db > -12 ? 'very loud' : pct < 45 ? 'a bit soft' : 'good';

    const t = (performance.now() - state.startedAt) / 1000;
    if (hz) live.pitchPoints.push({ t, hz });
    live.draw();

    if (syllablesPerSec !== null && syllablesPerSec !== undefined) {
      const wpm = Math.round((syllablesPerSec * 60) / SYLLABLES_PER_WORD);
      const chip = $('pace-live');
      const label = wpm < 110 ? 'Slow' : wpm > 185 ? 'Fast' : 'On pace';
      chip.textContent = label;
      chip.className = `meter-chip ${label === 'On pace' ? 'good' : label.toLowerCase()}`;
      $('pace-value').textContent = `~${wpm} words/min`;
    }
  },
};

const liveTranscript = {
  el: $('live-transcript'),
  interimEl: null,
  text: '',
  reset() {
    this.el.innerHTML = '<span class="placeholder">Start speaking. Your words appear here.</span>';
    this.interimEl = null;
    this.text = '';
  },
  update(newFinal, interim) {
    if (!this.interimEl) {
      this.el.textContent = '';
      this.interimEl = document.createElement('span');
      this.interimEl.className = 'interim';
      this.el.append(this.interimEl);
    }
    if (newFinal) {
      this.interimEl.before(document.createTextNode(newFinal));
      this.text += newFinal;
      const fillers = analyze(this.text, 60).fillerCount;
      $('filler-live').textContent = fillers;
    }
    this.interimEl.textContent = interim;
    const nearBottom = this.el.scrollHeight - this.el.scrollTop - this.el.clientHeight < 40;
    if (nearBottom) this.el.scrollTop = this.el.scrollHeight;
  },
};

$('start-btn').addEventListener('click', async () => {
  if (state.recording) return;
  $('mic-note').hidden = true;
  if (!microphoneAvailable()) { showMessage($('mic-note'), micUnavailableMessage()); return; }

  const recorder = new LiveRecorder({ onLevel: live.onLevel });
  try {
    await recorder.start();
  } catch (err) {
    showMessage($('mic-note'), micUnavailableMessage(err));
    return;
  }
  state.recorder = recorder;
  setBusy(true);

  // Live words are a bonus: the voice report doesn't depend on them.
  liveTranscript.reset();
  $('filler-live').textContent = '0';
  $('filler-note').textContent = speechSupported() ? 'so far' : 'needs Chrome, Edge or Safari';
  state.transcriber = null;
  if (speechSupported()) {
    try {
      state.transcriber = new Transcriber({
        onUpdate: (newFinal, interim) => liveTranscript.update(newFinal, interim),
        onError: () => { $('filler-note').textContent = 'live words unavailable'; },
      });
      state.transcriber.start();
    } catch {
      state.transcriber = null;
    }
  }

  live.pitchPoints = [];
  $('pace-live').textContent = 'Listening…';
  $('pace-live').className = 'meter-chip';
  $('pace-value').textContent = '—';
  stopPrep();
  const prompt = currentPrompt();
  $('recording-topic').hidden = !prompt;
  $('recording-delivery').hidden = !prompt;
  if (prompt) {
    $('recording-topic').textContent = `“${prompt.text}”`;
    const delivery = DELIVERY[prompt.delivery];
    $('recording-delivery').replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: `${delivery.label}: ` }),
      document.createTextNode(prompt.twist ? `${delivery.cue} Twist: ${prompt.twist}` : delivery.cue),
    );
  }
  $('timer').textContent = '0:00';
  $('timer').classList.remove('overtime');
  $('timer-target').textContent = `aim for ${formatClock(state.targetSeconds)}`;
  $('stop-btn').disabled = false;
  $('stop-btn').textContent = 'Stop and get my report';

  state.startedAt = performance.now();
  state.timerInterval = setInterval(() => {
    const elapsed = (performance.now() - state.startedAt) / 1000;
    $('timer').textContent = formatClock(elapsed);
    $('timer').classList.toggle('overtime', elapsed > state.targetSeconds);
  }, 250);
  try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }

  show('recording');
});

$('stop-btn').addEventListener('click', async () => {
  if (!state.recording || !state.recorder) return;
  $('stop-btn').disabled = true;
  $('stop-btn').textContent = 'Finishing…';
  clearInterval(state.timerInterval);
  state.wakeLock?.release?.().catch(() => {});

  const [blob, transcript] = await Promise.all([
    state.recorder.stop(),
    state.transcriber ? state.transcriber.stop() : Promise.resolve(''),
  ]);
  const clarity = state.transcriber?.clarity() ?? null;
  state.recorder = null;
  setBusy(false);
  await analyzeBlob(blob, {
    source: 'live',
    transcript: transcript || null,
    clarity,
    fileName: null,
  });
});

/* ================= Upload ================= */

function chooseFile(file) {
  showMessage($('upload-error'), '');
  if (!file) return;
  const looksLikeMedia = /^(audio|video)\//.test(file.type) || /\.(m4a|mp3|wav|webm|ogg|oga|opus|aac|flac|mp4|mov|caf|amr|3gp)$/i.test(file.name);
  if (!looksLikeMedia) {
    showMessage($('upload-error'), `"${file.name}" doesn't look like an audio or video file.`);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showMessage($('upload-error'), `That file is ${(file.size / 1048576).toFixed(0)} MB. Files up to ${MAX_FILE_BYTES / 1048576} MB work; trim it or export the audio only.`);
    return;
  }
  state.file = file;
  $('file-name').textContent = file.name;
  $('file-info').textContent = `${(file.size / 1048576).toFixed(1)} MB`;
  $('file-panel').hidden = false;
  $('drop-zone').hidden = true;
  $('capture-btn').hidden = true;
}

function clearFile() {
  state.file = null;
  $('file-input').value = '';
  $('capture-input').value = '';
  $('upload-transcript').value = '';
  $('file-panel').hidden = true;
  $('drop-zone').hidden = false;
  if (window.matchMedia?.('(pointer: coarse)').matches) $('capture-btn').hidden = false;
}

$('file-input').addEventListener('change', (e) => chooseFile(e.target.files[0]));
$('capture-input').addEventListener('change', (e) => chooseFile(e.target.files[0]));
$('file-clear').addEventListener('click', clearFile);

const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  chooseFile(e.dataTransfer.files[0]);
});

$('analyze-file-btn').addEventListener('click', async () => {
  if (!state.file) return;
  const transcript = $('upload-transcript').value.trim() || null;
  await analyzeBlob(state.file, { source: 'upload', transcript, clarity: null, fileName: state.file.name });
});

/* ================= Analysis pipeline ================= */

function processingStep(text) {
  $('processing-step').textContent = text;
}

async function analyzeBlob(blob, { source, transcript, clarity, fileName }) {
  show('processing');
  processingStep('Reading the audio…');
  let decoded;
  try {
    decoded = await decodeAudio(await blob.arrayBuffer());
  } catch (err) {
    show('setup');
    showMessage(source === 'live' ? $('mic-note') : $('upload-error'), err.message);
    return;
  }

  processingStep(`Measuring pitch, pauses and pace across ${formatClock(Math.min(decoded.durationSec, MAX_ANALYSIS_SEC))}…`);
  let acoustic;
  try {
    acoustic = await runAnalysis(decoded.samples, 16000);
  } catch (err) {
    show('setup');
    showMessage($('upload-error'), `Analysis failed: ${err.message}`);
    return;
  }

  // With words, pace is exact: words over the time from first to last speech.
  const talkSec = acoustic.speechFound ? acoustic.talkSec : decoded.durationSec;
  const metrics = transcript ? analyze(transcript, talkSec) : null;
  const prompt = currentPrompt();
  const report = buildReport({ text: metrics, acoustic, clarity, delivery: deliveryFor(prompt) });
  const warnings = qualityNotes(acoustic);
  if (decoded.trimmed) warnings.push(`Only the first ${MAX_ANALYSIS_SEC / 60} minutes were analyzed.`);

  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(blob);

  const { timeline, ...acousticSummary } = acoustic;
  if (acousticSummary.pauses) acousticSummary.pauses = { ...acousticSummary.pauses, list: acousticSummary.pauses.list.slice(0, 300) };
  const session = {
    at: new Date().toISOString(),
    source,
    mode: state.mode,
    topic: prompt?.text ?? null,
    prompt,
    fileName,
    durationSec: Math.round(decoded.durationSec),
    transcript,
    metrics,
    clarity,
    acoustic: acousticSummary,
    timeline,
    report,
    score: report.score,
  };
  await finishSession(session, warnings);
  if (source === 'upload') clearFile();
}

async function finishSession(session, warnings = []) {
  processingStep('Saving your take…');
  const saved = await saveSession(session);
  if (!saved) warnings.push("This take couldn't be saved to your history (storage is blocked or full).");
  const take = saved ? (await loadSessions()).length : null;
  renderResults(saved || session, { warnings, take, audioUrl: state.audioUrl });
}

/* ================= Text only ================= */

$('analyze-manual-btn').addEventListener('click', async () => {
  const transcript = $('manual-transcript').value.trim();
  const seconds = Number($('manual-duration').value);
  if (!transcript) { showMessage($('manual-error'), 'Paste or type a transcript first.'); return; }
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) {
    showMessage($('manual-error'), 'Enter how long you spoke, between 5 and 3600 seconds.');
    $('manual-duration').focus();
    return;
  }
  showMessage($('manual-error'), '');
  const metrics = analyze(transcript, seconds);
  const prompt = currentPrompt();
  const report = buildReport({ text: metrics, delivery: deliveryFor(prompt) });
  if (state.audioUrl) { URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; }
  show('processing');
  await finishSession({
    at: new Date().toISOString(),
    source: 'text',
    mode: state.mode,
    topic: prompt?.text ?? null,
    prompt,
    durationSec: seconds,
    transcript,
    metrics,
    report,
    score: report.score,
  });
});

/* ================= Results ================= */

const VERDICTS = [
  [85, 'A confident, well-paced take.'],
  [70, 'Solid delivery with a couple of things to tighten.'],
  [55, 'Good foundation. Two or three habits are holding it back.'],
  [0, "Plenty to work on, and each fix below makes a quick difference."],
];

function sourceLabel(s) {
  const kind = s.prompt
    ? [CATEGORY[s.prompt.category]?.label, DIFFICULTY[s.prompt.difficulty]?.label].filter(Boolean).join(', ')
    : null;
  const how = s.source === 'upload' ? (s.fileName ? `Recording · ${s.fileName}` : 'Recording')
    : s.source === 'text' ? 'Transcript only'
      : s.mode === 'impromptu' ? 'Live · impromptu' : 'Live';
  return kind ? `${kind} · ${how}` : how;
}

const GOAL_VERDICTS = {
  hit: ['strong', 'Hit'],
  close: ['fair', 'Nearly there'],
  missed: ['focus', 'Not yet'],
  unmeasured: ['unmeasured', 'Needs a transcript'],
};

function renderGoal(session, report) {
  const goal = report.deliveryGoal;
  $('goal-block').hidden = !goal;
  if (!goal) return;
  $('goal-label').textContent = goal.label;
  const [cls, text] = GOAL_VERDICTS[goal.verdict];
  $('goal-verdict').className = `status ${cls}`;
  $('goal-verdict').textContent = text;
  const rows = goal.items.map((i) => {
    const li = document.createElement('li');
    li.append(`${i.label} `, Object.assign(document.createElement('span'), { textContent: `${i.score}/100` }));
    return li;
  });
  if (session.prompt?.twist) {
    const li = document.createElement('li');
    li.textContent = `Twist: ${session.prompt.twist}`;
    rows.push(li);
  }
  $('goal-skills').replaceChildren(...rows);
}

function renderScore(score) {
  const dial = $('score-dial');
  dial.style.setProperty('--pct', score);
  dial.style.setProperty('--dial-color', score >= 80 ? 'var(--good)' : score >= 55 ? 'var(--accent)' : 'var(--focus)');
  $('score-value').textContent = score;
  dial.setAttribute('aria-label', `Score ${score} out of 100`);
  $('score-verdict').textContent = VERDICTS.find(([min]) => score >= min)[1];
}

function reportCard(item) {
  const card = document.createElement('article');
  card.className = `card report-item ${item.status}`;
  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = item.label;
  const status = document.createElement('span');
  status.className = `status ${item.status}`;
  status.textContent = { strong: 'Strong', fair: 'Fair', focus: 'Work on this' }[item.status];
  header.append(title, status);

  const reading = document.createElement('div');
  reading.className = 'reading';
  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = item.value;
  const unit = document.createElement('span');
  unit.className = 'unit';
  unit.textContent = item.unit;
  reading.append(value, unit);

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${item.label} score ${item.score} out of 100`);
  const fill = document.createElement('span');
  fill.style.width = `${item.score}%`;
  bar.append(fill);

  const detail = document.createElement('p');
  detail.className = 'detail';
  detail.textContent = `${item.detail} · ${item.score}/100`;
  const tip = document.createElement('p');
  tip.className = 'tip';
  tip.textContent = item.tip;
  card.append(header, reading, bar, detail, tip);
  return card;
}

// Transcript with fillers marked and hard-to-recognize phrases underlined.
function renderTranscript(container, transcript, metrics, clarity) {
  container.replaceChildren();
  const unclear = new Set((clarity?.unclear ?? []).map((t) => t.trim()));
  const fillerWords = new Set(Object.keys(metrics?.fillerBreakdown ?? {}).filter((w) => !w.includes(' ')));
  const fillerPhrases = Object.keys(metrics?.fillerBreakdown ?? {}).filter((w) => w.includes(' '));
  const phraseRe = fillerPhrases.length ? new RegExp(`\\b(${fillerPhrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi') : null;

  for (const line of transcript.split('\n')) {
    const lineEl = document.createElement('span');
    if (unclear.has(line.trim())) lineEl.className = 'unclear';
    // Split into words and separators, marking filler words and phrases.
    const parts = phraseRe ? line.split(phraseRe) : [line];
    for (const part of parts) {
      if (phraseRe && fillerPhrases.some((p) => p.toLowerCase() === part.toLowerCase())) {
        const m = document.createElement('mark');
        m.textContent = part;
        lineEl.append(m);
        continue;
      }
      for (const token of part.split(/(\s+)/)) {
        const bare = token.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
        if (bare && fillerWords.has(bare) && ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm', 'actually', 'basically', 'literally'].includes(bare)) {
          const m = document.createElement('mark');
          m.textContent = token;
          lineEl.append(m);
        } else {
          lineEl.append(document.createTextNode(token));
        }
      }
    }
    container.append(lineEl, document.createTextNode('\n'));
  }
}

function renderPauses(acoustic) {
  const list = acoustic?.pauses?.list ?? [];
  $('pause-details').hidden = list.length === 0;
  if (!list.length) return;
  $('pause-summary').textContent = `· ${acoustic.pauses.count} in total, longest ${acoustic.pauses.longestSec}s`;
  const rows = [...list].sort((a, b) => b.duration - a.duration).slice(0, 12).sort((a, b) => a.start - b.start).map((p) => {
    const tr = document.createElement('tr');
    const kind = p.duration >= 2 ? 'Long' : p.duration >= 1 ? 'Deliberate' : 'Breath';
    for (const value of [formatClock(p.start), `${p.duration.toFixed(1)}s`, kind]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    return tr;
  });
  $('pause-rows').replaceChildren(...rows);
}

function renderTimelineCard(session, audioUrl) {
  const card = $('timeline-card');
  const player = $('player');
  state.timelineControl = null;
  if (!session.timeline) { card.hidden = true; player.removeAttribute('src'); return; }
  card.hidden = false;

  player.hidden = !audioUrl;
  if (audioUrl) player.src = audioUrl;
  else player.removeAttribute('src');

  const draw = () => {
    state.timelineControl = renderTimeline($('timeline'), session.timeline, {
      pauses: session.acoustic?.pauses?.list ?? [],
      medianHz: session.acoustic?.pitch?.medianHz,
      onSeek: audioUrl ? (sec) => { player.currentTime = sec; player.play().catch(() => {}); } : null,
    });
  };
  draw();
  state.redrawTimeline = draw;
  $('timeline-hint').textContent = audioUrl
    ? 'Hover to read a moment. Click anywhere on the chart to play from there.'
    : 'Hover to read a moment. The recording itself is not stored, so playback is only available right after a take.';
}

$('player').addEventListener('timeupdate', () => state.timelineControl?.setPlayhead($('player').currentTime));
$('player').addEventListener('ended', () => state.timelineControl?.setPlayhead(null));

function renderResults(session, { warnings = [], take = null, audioUrl = null, fromHistory = false, example = false } = {}) {
  state.current = session;
  stopCoaching();

  const when = new Date(session.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('results-eyebrow').textContent = [example ? 'Example' : take ? `Take ${take}` : null, example ? null : when, sourceLabel(session)].filter(Boolean).join(' · ');
  $('results-heading').textContent = example ? 'Example delivery report' : fromHistory ? 'Take review' : 'Delivery report';

  const warningsEl = $('result-warnings');
  warningsEl.replaceChildren(...warnings.map((w) => { const p = document.createElement('p'); p.textContent = w; return p; }));
  warningsEl.hidden = warnings.length === 0;

  // Older sessions have no report: build one from what they stored.
  const report = session.report ?? buildReport({ text: session.metrics });
  $('results-prompt').hidden = !session.prompt;
  $('results-prompt').textContent = session.prompt ? `“${session.prompt.text}”` : '';
  renderGoal(session, report);
  renderScore(sessionScore(session) ?? report.score);
  const measured = report.items.map((i) => i.label.toLowerCase());
  $('score-measured').textContent = measured.length ? `Based on ${measured.join(', ')}.` : '';

  const focus = report.focus.length ? report.focus : [];
  $('focus-list').replaceChildren(...(focus.length ? focus : [{ label: 'Keep it up', tip: 'Nothing scored below 85. Try a longer talk or a harder topic next.' }]).map((item) => {
    const li = document.createElement('li');
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.label;
    const tip = document.createElement('p');
    tip.className = 'tip';
    tip.textContent = item.tip;
    body.append(title, tip);
    li.append(body);
    return li;
  }));
  $('strengths').hidden = report.strengths.length === 0;
  $('strength-list').replaceChildren(...report.strengths.map((i) => {
    const li = document.createElement('li');
    li.textContent = i.label;
    return li;
  }));

  $('report-grid').replaceChildren(...report.items.map(reportCard));
  renderTimelineCard(session, audioUrl);
  renderPauses(session.acoustic);

  // Words.
  const hasWords = typeof session.transcript === 'string' && session.transcript.length > 0;
  $('words-card').hidden = !hasWords && !session.trimmed;
  $('filler-chips').replaceChildren(...Object.entries(session.metrics?.fillerBreakdown ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${word} × ${count}`;
      return chip;
    }));
  $('unclear-key').hidden = !(session.clarity?.unclear?.length);
  if (hasWords) renderTranscript($('result-transcript'), session.transcript, session.metrics, session.clarity);
  else $('result-transcript').textContent = session.trimmed ? 'The transcript for this older take was removed to free up storage.' : '';

  renderCoachingPanel(session, example);

  $('back-history-btn').hidden = !fromHistory;
  show('results');
}

async function openSession(id) {
  const session = await getSession(id);
  if (!session) return;
  const sessions = await loadSessions();
  const take = sessions.length - sessions.findIndex((s) => s.id === id);
  renderResults(session, { fromHistory: true, take });
}

$('again-btn').addEventListener('click', () => {
  if (state.mode === 'prompt') newPrompt();
  show('setup');
});
$('back-history-btn').addEventListener('click', showHistory);
$('example-btn').addEventListener('click', () => renderResults(EXAMPLE_SESSION, { example: true }));

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!views.results.hidden && state.current?.timeline) state.redrawTimeline?.();
    if (!views.history.hidden) renderHistoryChart();
  });
});

/* ================= Coaching ================= */

let coachMode = 'key';
coachingMode().then((mode) => {
  coachMode = mode;
  if (state.current && !views.results.hidden) renderCoachingPanel(state.current, state.current === EXAMPLE_SESSION);
});

function renderCoachOutput(text) {
  // Section headings ("WHAT WORKED:") on their own line become bold labels.
  const out = $('ai-output');
  out.replaceChildren();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(WHAT WORKED|WHAT TO WORK ON|ONE DRILL)\s*:?\s*(.*)$/i);
    if (m) {
      const h = document.createElement('span');
      h.className = 'ai-heading';
      h.textContent = m[1].charAt(0) + m[1].slice(1).toLowerCase();
      out.append(h);
      if (m[2]) out.append(document.createTextNode(`${m[2]}\n`));
    } else {
      out.append(document.createTextNode(`${line}\n`));
    }
  }
}

function renderCoachingPanel(session, example = false) {
  const out = $('ai-output');
  out.classList.remove('error');
  const canCoach = Boolean(session.report?.items?.length);
  $('ai-panel').hidden = !canCoach && !session.coaching;

  if (coachMode === 'claude') {
    $('ai-intro').textContent = 'Claude reads your numbers and transcript and writes a short coaching note. It uses your Claude account; the first time, you\'ll be asked to allow it.';
    $('ai-key-row').hidden = true;
  } else {
    $('ai-intro').textContent = 'Uses your own Anthropic API key, kept only in this browser and sent only to api.anthropic.com.';
    $('ai-key-row').hidden = false;
    $('api-key-input').value = loadApiKey();
  }
  if (example) $('ai-intro').textContent += ' This example has a saved note below.';

  if (session.coaching) {
    renderCoachOutput(session.coaching);
    out.hidden = false;
  } else {
    out.hidden = true;
    out.textContent = '';
  }
  $('get-coaching-btn').textContent = session.coaching ? 'Get a fresh note' : 'Get coaching';
  $('get-coaching-btn').disabled = !canCoach;
}

function stopCoaching() {
  state.coachAbort?.abort();
  state.coachAbort = null;
  $('stop-coaching-btn').hidden = true;
  $('get-coaching-btn').disabled = false;
}

$('stop-coaching-btn').addEventListener('click', stopCoaching);

$('get-coaching-btn').addEventListener('click', async () => {
  const session = state.current;
  if (!session) return;
  const apiKey = $('api-key-input').value.trim();
  if (coachMode === 'key') {
    if (!apiKey) {
      const out = $('ai-output');
      out.hidden = false;
      out.classList.add('error');
      out.textContent = 'Enter your Anthropic API key first.';
      return;
    }
    saveApiKey(apiKey);
  }

  const out = $('ai-output');
  const btn = $('get-coaching-btn');
  const fresh = Boolean(session.coaching);
  btn.disabled = true;
  $('stop-coaching-btn').hidden = false;
  out.hidden = false;
  out.classList.remove('error');
  out.textContent = 'Thinking…';
  const controller = new AbortController();
  state.coachAbort = controller;

  try {
    const text = await getCoaching(session, {
      apiKey,
      fresh,
      signal: controller.signal,
      onText: (whole) => { if (state.current === session) renderCoachOutput(whole); },
    });
    session.coaching = text;
    if (session.id && session !== EXAMPLE_SESSION) await updateSession(session.id, { coaching: text });
  } catch (err) {
    if (state.current !== session) return;
    if (err.partial) renderCoachOutput(`${err.partial}\n\n(${err.message})`);
    else {
      out.classList.add('error');
      out.textContent = err.message;
    }
    if (err.permanent) btn.hidden = true;
  } finally {
    if (state.coachAbort === controller) state.coachAbort = null;
    $('stop-coaching-btn').hidden = true;
    btn.disabled = false;
    btn.textContent = session.coaching ? 'Get a fresh note' : 'Get coaching';
  }
});

/* ================= History ================= */

function scoreClass(score) {
  if (score >= 80) return 'score-good';
  if (score >= 55) return 'score-mid';
  return 'score-low';
}

function stat({ value, label, sub, hero }) {
  const el = document.createElement('div');
  el.className = `stat${hero ? ' hero' : ''}`;
  const v = document.createElement('span');
  v.className = 'value';
  v.textContent = value;
  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;
  el.append(v, l);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'sub';
    s.textContent = sub;
    el.append(s);
  }
  return el;
}

let historyCache = [];

function renderHistoryChart() {
  renderScoreChart($('score-chart'), historyCache, { onSelect: openSession });
}

async function renderHistory() {
  const sessions = (await loadSessions()).filter((s) => sessionScore(s) !== null);
  historyCache = sessions;
  const empty = sessions.length === 0;
  $('history-empty').hidden = !empty;
  $('history-content').hidden = empty;
  $('storage-note').textContent = storageKind() === 'account'
    ? 'Saved privately to your Claude account. Only you can see these takes.'
    : 'Saved in this browser only.';
  if (empty) return;

  const scores = sessions.map(sessionScore);
  const recent = scores.slice(0, 5);
  const delta = scores.length > 1 ? scores[0] - scores[1] : null;
  $('history-summary').replaceChildren(
    stat({ value: scores[0], label: 'Latest score', hero: true, sub: delta === null ? 'first take' : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} vs previous` }),
    stat({ value: Math.max(...scores), label: 'Best score' }),
    stat({ value: Math.round(recent.reduce((a, b) => a + b, 0) / recent.length), label: `Average, last ${recent.length}` }),
    stat({ value: sessions.length, label: sessions.length === 1 ? 'Take' : 'Takes' }),
  );

  const rows = sessions.map((s) => {
    const tr = document.createElement('tr');
    const whenTd = document.createElement('td');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'row-link';
    const when = new Date(s.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    link.textContent = when;
    link.setAttribute('aria-label', `Open the take from ${when}, score ${sessionScore(s)}`);
    whenTd.append(link);
    tr.append(whenTd);
    const length = s.durationSec ?? s.metrics?.durationSeconds;
    for (const value of [sessionSource(s), formatClock(length), sessionPace(s)]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const scoreTd = document.createElement('td');
    scoreTd.textContent = sessionScore(s);
    scoreTd.className = scoreClass(sessionScore(s));
    tr.append(scoreTd);
    tr.addEventListener('click', () => openSession(s.id));
    return tr;
  });
  $('history-table').querySelector('tbody').replaceChildren(...rows);
  renderHistoryChart();
}

async function showHistory() {
  if (state.recording) return;
  show('history');
  await renderHistory();
}

$('nav-practice').addEventListener('click', () => { if (!state.recording) show('setup'); });
$('nav-history').addEventListener('click', showHistory);
$('empty-practice-btn').addEventListener('click', () => show('setup'));

$('clear-history-btn').addEventListener('click', () => {
  $('clear-history-btn').hidden = true;
  $('clear-confirm').hidden = false;
});
$('clear-no').addEventListener('click', () => {
  $('clear-history-btn').hidden = false;
  $('clear-confirm').hidden = true;
});
$('clear-yes').addEventListener('click', async () => {
  await clearSessions();
  $('clear-history-btn').hidden = false;
  $('clear-confirm').hidden = true;
  await renderHistory();
});

window.addEventListener('beforeunload', (e) => {
  if (state.recording) e.preventDefault();
});

/* ================= Start ================= */

// Where history lives is decided in the background; the page works either way.
initStorage();
show('setup');
