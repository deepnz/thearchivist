import { analyze, tips } from './analysis.js';
import { speechSupported, Transcriber } from './transcription.js';
import { getCoaching } from './coach.js';
import {
  loadSessions, getSession, saveSession, updateSession, clearSessions, loadApiKey, saveApiKey,
} from './storage.js';
import { randomPrompt } from './prompts.js';
import { renderScoreChart } from './chart.js';

const $ = (id) => document.getElementById(id);

const views = {
  setup: $('view-setup'),
  recording: $('view-recording'),
  results: $('view-results'),
  history: $('view-history'),
};

const MIN_MANUAL_SECONDS = 5;
const MAX_MANUAL_SECONDS = 3600;

const SPEECH_ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings, or paste a transcript below.',
  'service-not-allowed': "This browser's speech service isn't available. Paste a transcript below instead.",
  'audio-capture': 'No microphone was found. Connect one, or paste a transcript below.',
  network: "This browser couldn't reach its speech-recognition service. Paste a transcript below instead.",
};

const state = {
  mode: 'free',
  targetSeconds: 120,
  topic: null,
  startedAt: 0,
  timerInterval: null,
  transcriber: null,
  recording: false,
  current: null, // session shown on the results view: { id?, at, mode, topic, transcript, metrics, coaching? }
};

function show(viewName) {
  Object.values(views).forEach((v) => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
  $('nav-practice').classList.toggle('active', viewName !== 'history');
  $('nav-history').classList.toggle('active', viewName === 'history');
}

function setRecording(recording) {
  state.recording = recording;
  // Navigating away mid-recording would leave the mic and timer running.
  $('nav-practice').disabled = recording;
  $('nav-history').disabled = recording;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/* ---------- Setup ---------- */

$('mode-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  state.mode = btn.dataset.mode;
  [...$('mode-picker').children].forEach((b) => b.classList.toggle('active', b === btn));
  const isImpromptu = state.mode === 'impromptu';
  $('topic-card').classList.toggle('hidden', !isImpromptu);
  if (isImpromptu && !state.topic) shuffleTopic();
});

$('duration-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-seconds]');
  if (!btn) return;
  state.targetSeconds = Number(btn.dataset.seconds);
  [...$('duration-picker').children].forEach((b) => b.classList.toggle('active', b === btn));
});

function shuffleTopic() {
  state.topic = randomPrompt(state.topic);
  $('topic-text').textContent = state.topic;
}
$('shuffle-topic').addEventListener('click', shuffleTopic);

function showManualEntry(message) {
  $('manual-notice').textContent = message;
  $('unsupported').classList.remove('hidden');
  $('show-manual-btn').classList.add('hidden');
}

$('show-manual-btn').addEventListener('click', () => {
  showManualEntry('Paste or type what you said, and how long you spoke for.');
});

/* ---------- Recording ---------- */

// Live transcript is rendered incrementally: finalized text is appended once as
// a text node, and only the small interim span is rewritten on each update.
const transcriptView = {
  el: $('live-transcript'),
  interimEl: null,
  reset() {
    this.el.innerHTML = '<span class="placeholder">Start speaking — your words will appear here…</span>';
    this.interimEl = null;
  },
  update(newFinal, interim) {
    if (!this.interimEl) {
      this.el.textContent = '';
      this.interimEl = document.createElement('span');
      this.interimEl.className = 'interim';
      this.el.append(this.interimEl);
    }
    if (newFinal) this.interimEl.before(document.createTextNode(newFinal));
    this.interimEl.textContent = interim;
    const nearBottom = this.el.scrollHeight - this.el.scrollTop - this.el.clientHeight < 40;
    if (nearBottom) this.el.scrollTop = this.el.scrollHeight;
  },
};

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function elapsedSeconds() {
  return (performance.now() - state.startedAt) / 1000;
}

function handleSpeechError(code, partialTranscript) {
  if (!state.recording) return;
  const duration = elapsedSeconds();
  stopTimer();
  setRecording(false);

  if (partialTranscript) {
    // Recognition died mid-talk: keep what was captured rather than losing it.
    finishSession(partialTranscript, duration, {
      warning: `Transcription stopped early (${code}). Results cover only the part captured before that — about ${formatTime(duration)}.`,
    });
    return;
  }

  show('setup');
  showManualEntry(SPEECH_ERROR_MESSAGES[code] || `Speech recognition failed (${code}). Paste a transcript below instead.`);
}

$('start-btn').addEventListener('click', () => {
  if (state.recording) return;

  state.transcriber = new Transcriber({
    onUpdate: (newFinal, interim) => transcriptView.update(newFinal, interim),
    onError: handleSpeechError,
  });

  transcriptView.reset();
  $('recording-topic').classList.toggle('hidden', state.mode !== 'impromptu');
  if (state.mode === 'impromptu') $('recording-topic').textContent = `“${state.topic}”`;
  $('timer').textContent = '0:00';
  $('timer').classList.remove('overtime');
  $('stop-btn').disabled = false;

  try {
    state.transcriber.start();
  } catch (err) {
    showManualEntry(`Could not start recording (${err.message}). Paste a transcript below instead.`);
    return;
  }

  setRecording(true);
  state.startedAt = performance.now();
  state.timerInterval = setInterval(() => {
    const elapsed = elapsedSeconds();
    $('timer').textContent = formatTime(elapsed);
    $('timer').classList.toggle('overtime', elapsed > state.targetSeconds);
  }, 250);

  show('recording');
});

$('stop-btn').addEventListener('click', async () => {
  if (!state.recording) return;
  const duration = elapsedSeconds();
  stopTimer();
  setRecording(false);
  $('stop-btn').disabled = true;
  $('stop-btn').textContent = 'Finishing…';
  const transcript = await state.transcriber.stop();
  $('stop-btn').textContent = '■ Stop & analyze';
  finishSession(transcript, duration);
});

/* ---------- Manual fallback ---------- */

if (!speechSupported()) {
  $('start-btn').classList.add('hidden');
  showManualEntry("Live transcription isn't supported in this browser (try Chrome, Edge, or Safari). You can still paste or type a transcript below and analyze it.");
}

$('analyze-manual-btn').addEventListener('click', () => {
  const transcript = $('manual-transcript').value.trim();
  const durationSeconds = Number($('manual-duration').value);
  if (!transcript) { alert('Paste or type a transcript first.'); return; }
  if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_MANUAL_SECONDS || durationSeconds > MAX_MANUAL_SECONDS) {
    alert(`Enter how long you spoke, between ${MIN_MANUAL_SECONDS} and ${MAX_MANUAL_SECONDS} seconds.`);
    $('manual-duration').focus();
    return;
  }
  finishSession(transcript, durationSeconds);
});

/* ---------- Results ---------- */

function statTile({ value, label, sub, hero }) {
  const tile = document.createElement('div');
  tile.className = `stat-tile${hero ? ' hero' : ''}`;
  tile.innerHTML = `<div class="value"></div><div class="label"></div>${sub ? '<div class="sub"></div>' : ''}`;
  tile.querySelector('.value').textContent = value;
  tile.querySelector('.label').textContent = label;
  if (sub) tile.querySelector('.sub').textContent = sub;
  return tile;
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function modeLabel(mode) {
  return mode === 'impromptu' ? 'Impromptu' : 'Free talk';
}

function finishSession(transcript, durationSeconds, { warning } = {}) {
  const session = {
    at: new Date().toISOString(),
    mode: state.mode,
    topic: state.mode === 'impromptu' ? state.topic : null,
    transcript,
    metrics: analyze(transcript, durationSeconds),
  };
  const saved = saveSession(session);
  const warnings = [warning, saved ? null : "This session couldn't be saved to history (browser storage is blocked or full)."];
  renderResults(saved || session, { warnings });
}

// Renders a session on the results view — freshly recorded, or reopened from History.
function renderResults(session, { warnings = [], fromHistory = false } = {}) {
  state.current = session;
  const { metrics } = session;

  $('results-heading').textContent = fromHistory ? 'Session review' : 'Session results';
  const meta = [formatWhen(session.at), modeLabel(session.mode), session.topic ? `“${session.topic}”` : null]
    .filter(Boolean).join(' · ');
  $('results-meta').textContent = meta;
  $('results-meta').classList.toggle('hidden', !fromHistory);

  $('stat-grid').replaceChildren(
    statTile({ value: metrics.score, label: 'Score / 100', hero: true }),
    statTile({ value: metrics.wpm, label: 'Words per min', sub: 'target 130–170' }),
    statTile({ value: metrics.fillersPerMinute, label: 'Fillers / min', sub: `${metrics.fillerCount} total` }),
    statTile({ value: `${Math.round(metrics.vocabularyDiversity * 100)}%`, label: 'Vocabulary' }),
    statTile({ value: metrics.longestFluentStretch, label: 'Fluent stretch', sub: 'words w/o filler' }),
    statTile({ value: formatTime(metrics.durationSeconds), label: 'Duration' }),
  );

  $('filler-chips').replaceChildren(
    ...Object.entries(metrics.fillerBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([word, count]) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `${word} × ${count}`;
        return chip;
      }),
  );

  $('tips-list').replaceChildren(
    ...tips(metrics).map((tip) => {
      const li = document.createElement('li');
      li.textContent = tip;
      return li;
    }),
  );

  const hasTranscript = typeof session.transcript === 'string';
  let transcriptText = session.transcript || '(empty)';
  if (!hasTranscript) {
    transcriptText = session.trimmed
      ? 'The transcript for this older session was removed to free up browser storage.'
      : 'This session was recorded before transcripts were saved.';
  }
  $('result-transcript').textContent = transcriptText;

  // Coaching needs the transcript; a saved coaching result is shown as-is.
  $('ai-panel').classList.toggle('hidden', !hasTranscript && !session.coaching);
  $('ai-setup').classList.toggle('hidden', !hasTranscript);
  $('get-coaching-btn').textContent = session.coaching ? 'Get fresh coaching' : 'Get AI coaching';
  $('ai-output').classList.remove('error');
  $('ai-output').textContent = session.coaching || '';
  $('ai-output').classList.toggle('hidden', !session.coaching);
  $('api-key-input').value = loadApiKey();

  const shownWarnings = warnings.filter(Boolean);
  $('result-warning').textContent = shownWarnings.join(' ');
  $('result-warning').classList.toggle('hidden', shownWarnings.length === 0);

  $('back-history-btn').classList.toggle('hidden', !fromHistory);
  show('results');
  window.scrollTo(0, 0);
}

function openSession(id) {
  const session = getSession(id);
  if (session) renderResults(session, { fromHistory: true });
}

$('again-btn').addEventListener('click', () => {
  if (state.mode === 'impromptu') shuffleTopic();
  show('setup');
});

$('back-history-btn').addEventListener('click', showHistory);

/* ---------- AI coaching ---------- */

$('get-coaching-btn').addEventListener('click', async () => {
  const apiKey = $('api-key-input').value.trim();
  if (!apiKey) { alert('Enter your Anthropic API key first.'); return; }
  const session = state.current;
  if (typeof session?.transcript !== 'string') return;
  saveApiKey(apiKey);

  const btn = $('get-coaching-btn');
  const out = $('ai-output');
  btn.disabled = true;
  btn.textContent = 'Coaching…';
  out.classList.remove('hidden', 'error');
  out.textContent = 'Asking Claude for feedback…';

  let started = false;
  try {
    const coaching = await getCoaching({
      apiKey,
      transcript: session.transcript,
      metrics: session.metrics,
      mode: session.mode,
      topic: session.topic,
      onText: (chunk) => {
        if (!started) { out.textContent = ''; started = true; }
        out.append(chunk);
      },
    });
    session.coaching = coaching;
    // Keep the coaching with the session so it can be reread from History.
    if (session.id) updateSession(session.id, { coaching });
  } catch (err) {
    out.classList.add('error');
    out.textContent = `Coaching failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = session.coaching ? 'Get fresh coaching' : 'Get AI coaching';
  }
});

/* ---------- History ---------- */

function scoreClass(score) {
  if (score >= 75) return 'score-good';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

function renderHistorySummary(sessions) {
  // sessions are newest first
  const scores = sessions.map((s) => s.metrics.score);
  const recent = scores.slice(0, 5);
  const average = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  const previous = scores[1];
  const delta = previous === undefined ? null : scores[0] - previous;
  $('history-summary').replaceChildren(
    statTile({
      value: scores[0],
      label: 'Latest score',
      sub: delta === null ? 'first session' : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} vs previous`,
      hero: true,
    }),
    statTile({ value: Math.max(...scores), label: 'Best score' }),
    statTile({ value: average, label: `Average, last ${recent.length}` }),
    statTile({ value: sessions.length, label: sessions.length === 1 ? 'Session' : 'Sessions' }),
  );
}

function renderHistoryTable(sessions) {
  const rows = sessions.map((s) => {
    const tr = document.createElement('tr');
    const whenTd = document.createElement('td');
    const link = document.createElement('button');
    link.className = 'row-link';
    link.textContent = formatWhen(s.at);
    link.setAttribute('aria-label', `Review session from ${formatWhen(s.at)}, score ${s.metrics.score}`);
    whenTd.append(link);
    tr.append(whenTd);

    const cells = [modeLabel(s.mode), formatTime(s.metrics.durationSeconds), s.metrics.wpm, s.metrics.fillersPerMinute];
    tr.append(...cells.map((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      return td;
    }));
    const scoreTd = document.createElement('td');
    scoreTd.textContent = s.metrics.score;
    scoreTd.className = scoreClass(s.metrics.score);
    tr.append(scoreTd);

    tr.addEventListener('click', () => openSession(s.id));
    return tr;
  });
  $('history-table').querySelector('tbody').replaceChildren(...rows);
}

function renderHistory() {
  // Newest first by date, so the tiles, table and chart always agree even if
  // save order and timestamps ever diverge (e.g. a changed device clock).
  const sessions = loadSessions().sort((a, b) => new Date(b.at) - new Date(a.at));
  const empty = sessions.length === 0;
  $('history-empty').classList.toggle('hidden', !empty);
  $('history-content').classList.toggle('hidden', empty);
  $('history-table').classList.toggle('hidden', empty);
  $('clear-history-btn').classList.toggle('hidden', empty);
  if (empty) return;

  renderHistorySummary(sessions);
  renderHistoryTable(sessions);
  renderScoreChart($('score-chart'), sessions, { onSelect: openSession });
}

function showHistory() {
  if (state.recording) return;
  // Show first so the chart can measure its container width.
  show('history');
  renderHistory();
}

// The chart is drawn at the container's pixel width; redraw when that changes.
let resizeFrame = null;
window.addEventListener('resize', () => {
  if (views.history.classList.contains('hidden')) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => renderScoreChart($('score-chart'), loadSessions(), { onSelect: openSession }));
});

$('nav-practice').addEventListener('click', () => { if (!state.recording) show('setup'); });
$('nav-history').addEventListener('click', showHistory);
$('clear-history-btn').addEventListener('click', () => {
  if (confirm('Delete all saved sessions?')) { clearSessions(); renderHistory(); }
});

window.addEventListener('beforeunload', (e) => {
  if (state.recording) e.preventDefault();
});

show('setup');
