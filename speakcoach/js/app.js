import { analyze, tips } from './analysis.js';
import { speechSupported, Transcriber } from './transcription.js';
import { getCoaching } from './coach.js';
import { loadSessions, saveSession, clearSessions, loadApiKey, saveApiKey } from './storage.js';
import { randomPrompt } from './prompts.js';

const $ = (id) => document.getElementById(id);

const views = {
  setup: $('view-setup'),
  recording: $('view-recording'),
  results: $('view-results'),
  history: $('view-history'),
};

const state = {
  mode: 'free',
  targetSeconds: 120,
  topic: null,
  startedAt: 0,
  timerInterval: null,
  transcriber: null,
  lastResult: null, // { transcript, metrics }
};

function show(viewName) {
  Object.values(views).forEach((v) => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
  $('nav-practice').classList.toggle('active', viewName !== 'history');
  $('nav-history').classList.toggle('active', viewName === 'history');
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

/* ---------- Recording ---------- */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderTranscript(finalText, interimText) {
  const el = $('live-transcript');
  if (!finalText && !interimText) return;
  el.innerHTML = '';
  el.append(document.createTextNode(finalText));
  if (interimText) {
    const span = document.createElement('span');
    span.className = 'interim';
    span.textContent = interimText;
    el.append(span);
  }
  el.scrollTop = el.scrollHeight;
}

$('start-btn').addEventListener('click', () => {
  state.transcriber = new Transcriber({
    onUpdate: renderTranscript,
    onError: (err) => {
      stopTimer();
      show('setup');
      alert(`Speech recognition error: ${err}. Check microphone permissions and try again.`);
    },
  });

  $('live-transcript').innerHTML = '<span class="placeholder">Start speaking — your words will appear here…</span>';
  $('recording-topic').classList.toggle('hidden', state.mode !== 'impromptu');
  if (state.mode === 'impromptu') $('recording-topic').textContent = `“${state.topic}”`;
  $('timer').textContent = '0:00';
  $('timer').classList.remove('overtime');

  try {
    state.transcriber.start();
  } catch (err) {
    alert(`Could not start recording: ${err.message}`);
    return;
  }

  state.startedAt = performance.now();
  state.timerInterval = setInterval(() => {
    const elapsed = (performance.now() - state.startedAt) / 1000;
    $('timer').textContent = formatTime(elapsed);
    $('timer').classList.toggle('overtime', elapsed > state.targetSeconds);
  }, 250);

  show('recording');
});

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

$('stop-btn').addEventListener('click', () => {
  const durationSeconds = (performance.now() - state.startedAt) / 1000;
  stopTimer();
  const transcript = state.transcriber.stop();
  finishSession(transcript, durationSeconds);
});

/* ---------- Manual fallback ---------- */

if (!speechSupported()) {
  $('start-btn').classList.add('hidden');
  $('unsupported').classList.remove('hidden');
}

$('analyze-manual-btn').addEventListener('click', () => {
  const transcript = $('manual-transcript').value.trim();
  const durationSeconds = Number($('manual-duration').value) || 60;
  if (!transcript) { alert('Paste or type a transcript first.'); return; }
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

function finishSession(transcript, durationSeconds) {
  const metrics = analyze(transcript, durationSeconds);
  state.lastResult = { transcript, metrics };

  const grid = $('stat-grid');
  grid.innerHTML = '';
  grid.append(
    statTile({ value: metrics.score, label: 'Score / 100', hero: true }),
    statTile({ value: metrics.wpm, label: 'Words per min', sub: 'target 130–170' }),
    statTile({ value: metrics.fillersPerMinute, label: 'Fillers / min', sub: `${metrics.fillerCount} total` }),
    statTile({ value: `${Math.round(metrics.vocabularyDiversity * 100)}%`, label: 'Vocabulary' }),
    statTile({ value: metrics.longestFluentStretch, label: 'Fluent stretch', sub: 'words w/o filler' }),
    statTile({ value: formatTime(metrics.durationSeconds), label: 'Duration' }),
  );

  const chips = $('filler-chips');
  chips.innerHTML = '';
  Object.entries(metrics.fillerBreakdown)
    .sort((a, b) => b[1] - a[1])
    .forEach(([word, count]) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${word} × ${count}`;
      chips.append(chip);
    });

  const list = $('tips-list');
  list.innerHTML = '';
  tips(metrics).forEach((tip) => {
    const li = document.createElement('li');
    li.textContent = tip;
    list.append(li);
  });

  $('result-transcript').textContent = transcript || '(empty)';
  $('ai-output').classList.add('hidden');
  $('ai-output').textContent = '';
  $('api-key-input').value = loadApiKey();

  saveSession({
    at: new Date().toISOString(),
    mode: state.mode,
    topic: state.mode === 'impromptu' ? state.topic : null,
    metrics,
  });

  show('results');
}

$('again-btn').addEventListener('click', () => {
  if (state.mode === 'impromptu') shuffleTopic();
  show('setup');
});

/* ---------- AI coaching ---------- */

$('get-coaching-btn').addEventListener('click', async () => {
  const apiKey = $('api-key-input').value.trim();
  if (!apiKey) { alert('Enter your Anthropic API key first.'); return; }
  if (!state.lastResult) return;
  saveApiKey(apiKey);

  const btn = $('get-coaching-btn');
  const out = $('ai-output');
  btn.disabled = true;
  btn.textContent = 'Coaching…';
  out.classList.remove('hidden', 'error');
  out.textContent = 'Asking Claude for feedback…';

  try {
    out.textContent = await getCoaching({
      apiKey,
      transcript: state.lastResult.transcript,
      metrics: state.lastResult.metrics,
      mode: state.mode,
      topic: state.topic,
    });
  } catch (err) {
    out.classList.add('error');
    out.textContent = `Coaching failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Get AI coaching';
  }
});

/* ---------- History ---------- */

function scoreClass(score) {
  if (score >= 75) return 'score-good';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

function renderHistory() {
  const sessions = loadSessions();
  const empty = sessions.length === 0;
  $('history-empty').classList.toggle('hidden', !empty);
  $('history-table').classList.toggle('hidden', empty);
  $('clear-history-btn').classList.toggle('hidden', empty);

  const tbody = $('history-table').querySelector('tbody');
  tbody.innerHTML = '';
  sessions.forEach((s) => {
    const tr = document.createElement('tr');
    const when = new Date(s.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const cells = [
      when,
      s.mode === 'impromptu' ? 'Impromptu' : 'Free talk',
      formatTime(s.metrics.durationSeconds),
      s.metrics.wpm,
      s.metrics.fillersPerMinute,
    ];
    cells.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    });
    const scoreTd = document.createElement('td');
    scoreTd.textContent = s.metrics.score;
    scoreTd.className = scoreClass(s.metrics.score);
    tr.append(scoreTd);
    tbody.append(tr);
  });
}

$('nav-practice').addEventListener('click', () => show('setup'));
$('nav-history').addEventListener('click', () => { renderHistory(); show('history'); });
$('clear-history-btn').addEventListener('click', () => {
  if (confirm('Delete all saved sessions?')) { clearSessions(); renderHistory(); }
});

show('setup');
