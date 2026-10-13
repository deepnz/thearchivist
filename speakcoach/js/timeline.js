// Delivery timeline: pitch and loudness over the talk, with pauses shaded.
//
// Two measures with different units -> two stacked panels sharing one time
// axis (never a dual-axis plot). Each panel is one series named by its own
// heading; pauses are a neutral band across both. Only the longest pauses
// get direct labels. A crosshair tooltip snaps to the pointer's time;
// clicking seeks the recording when one is loaded. The pause table and the
// report numbers carry the same information without hovering.

import { formatClock } from './report.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 22, right: 14, left: 46, bottom: 26 };
const PITCH_H = 118;
const LOUD_H = 78;
const GAP = 30;
const PITCH_LIMIT = 12; // semitones shown either side of the median

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function text(parent, content, attrs) {
  const node = el('text', attrs);
  node.textContent = content;
  parent.append(node);
  return node;
}

function niceStep(durationSec, maxTicks = 8) {
  for (const step of [5, 10, 15, 30, 60, 120, 300, 600]) if (durationSec / step <= maxTicks) return step;
  return 900;
}

// Path through points, starting a new segment at every gap (null).
function segmentedPath(values, x, y) {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined) { open = false; return; }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

// Closed areas down to the baseline, one per unbroken run.
function segmentedArea(values, x, y, baseline) {
  let d = '';
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      d += `M${x(run[0]).toFixed(1)},${baseline}`;
      for (const i of run) d += `L${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`;
      d += `L${x(run[run.length - 1]).toFixed(1)},${baseline}Z`;
    }
    run = [];
  };
  values.forEach((v, i) => { if (v === null || v === undefined) flush(); else run.push(i); });
  flush();
  return d;
}

/**
 * @param {HTMLElement} container
 * @param {{ step: number, pitch: (number|null)[], loud: (number|null)[] }} timeline
 * @param {{ pauses: {start:number,duration:number}[], medianHz: number, onSeek?: (sec:number)=>void }} opts
 * @returns {{ setPlayhead(sec: number|null): void }}
 */
export function renderTimeline(container, timeline, { pauses = [], medianHz, onSeek } = {}) {
  container.replaceChildren();
  const points = timeline.pitch.length;
  const durationSec = points * timeline.step;
  const width = Math.max(300, container.clientWidth || 640);
  const height = MARGIN.top + PITCH_H + GAP + LOUD_H + MARGIN.bottom;
  const plotW = width - MARGIN.left - MARGIN.right;

  const x = (i) => MARGIN.left + ((i + 0.5) * timeline.step / durationSec) * plotW;
  const xSec = (sec) => MARGIN.left + (sec / durationSec) * plotW;
  const pitchTop = MARGIN.top;
  const pitchY = (tenths) => {
    const st = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, tenths / 10));
    return pitchTop + PITCH_H / 2 - (st / PITCH_LIMIT) * (PITCH_H / 2);
  };
  const loudValues = timeline.loud.filter((v) => v !== null);
  const loudMax = Math.ceil(Math.max(...loudValues) + 2);
  const loudMin = Math.floor(Math.min(...loudValues) - 3);
  const loudTop = MARGIN.top + PITCH_H + GAP;
  const loudBase = loudTop + LOUD_H;
  const loudY = (db) => loudBase - ((db - loudMin) / (loudMax - loudMin)) * LOUD_H;

  const svg = el('svg', {
    width, height, viewBox: `0 0 ${width} ${height}`, class: 'timeline-chart', tabindex: '0', role: 'img',
    'aria-label': `Pitch and loudness over ${formatClock(durationSec)}, with ${pauses.length} pauses shaded. Use the arrow keys to move through the talk${onSeek ? ' and Enter to play from that point' : ''}.`,
  });

  // Pause bands across both panels.
  const longest = [...pauses].filter((p) => p.duration >= 2).sort((a, b) => b.duration - a.duration).slice(0, 3);
  for (const p of pauses) {
    svg.append(el('rect', {
      x: xSec(p.start), y: pitchTop, width: Math.max(1, xSec(p.start + p.duration) - xSec(p.start)),
      height: loudBase - pitchTop, class: p.duration >= 2 ? 'pause long' : 'pause',
    }));
  }
  for (const p of longest) {
    const mid = xSec(p.start + p.duration / 2);
    text(svg, `${p.duration.toFixed(1)}s`, {
      x: Math.min(width - MARGIN.right - 14, Math.max(MARGIN.left + 14, mid)), y: pitchTop - 6, class: 'pause-label', 'text-anchor': 'middle',
    });
  }

  // Panel headings name each series (they replace a legend).
  text(svg, 'Pitch', { x: MARGIN.left, y: 12, class: 'panel-title' });
  text(svg, 'Loudness', { x: MARGIN.left, y: loudTop - 8, class: 'panel-title' });

  // Pitch grid: your usual level, plus/minus 6 and 12 semitones.
  for (const st of [-12, -6, 0, 6, 12]) {
    const yy = pitchY(st * 10);
    svg.append(el('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: yy, y2: yy, class: st === 0 ? 'grid base' : 'grid' }));
    text(svg, st === 0 ? 'usual' : `${st > 0 ? '+' : '−'}${Math.abs(st)}`, {
      x: MARGIN.left - 6, y: yy, class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle',
    });
  }
  // Loudness grid: three levels in dB.
  const loudTicks = [loudMin, Math.round((loudMin + loudMax) / 2), loudMax];
  for (const db of loudTicks) {
    const yy = loudY(db);
    svg.append(el('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: yy, y2: yy, class: 'grid' }));
    text(svg, `${db}`, { x: MARGIN.left - 6, y: yy, class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
  }
  text(svg, 'st', { x: 4, y: pitchTop + PITCH_H / 2 - 16, class: 'tick unit' });
  text(svg, 'dB', { x: 4, y: loudTop + LOUD_H / 2 - 16, class: 'tick unit' });

  // Series.
  svg.append(el('path', { d: segmentedArea(timeline.loud, x, loudY, loudBase), class: 'loud-area' }));
  svg.append(el('path', { d: segmentedPath(timeline.loud, x, loudY), class: 'loud-line' }));
  svg.append(el('path', { d: segmentedPath(timeline.pitch, x, pitchY), class: 'pitch-line' }));

  // Time axis.
  const step = niceStep(durationSec);
  for (let sec = 0; sec <= durationSec + 0.01; sec += step) {
    text(svg, formatClock(sec), {
      x: xSec(sec), y: height - 8, class: 'tick', 'text-anchor': sec === 0 ? 'start' : 'middle',
    });
  }

  // Crosshair, playhead, hit layer.
  const crosshair = el('line', { y1: pitchTop, y2: loudBase, class: 'crosshair', visibility: 'hidden' });
  const playhead = el('line', { y1: pitchTop, y2: loudBase, class: 'playhead', visibility: 'hidden' });
  const hit = el('rect', { x: MARGIN.left, y: pitchTop, width: plotW, height: loudBase - pitchTop, class: 'hit' });
  if (!onSeek) hit.style.cursor = 'crosshair';
  svg.append(crosshair, playhead, hit);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip hidden';
  tooltip.setAttribute('role', 'status');
  container.append(svg, tooltip);

  let activeSec = null;
  function showAt(sec) {
    activeSec = Math.max(0, Math.min(durationSec - timeline.step / 2, sec));
    const i = Math.min(points - 1, Math.floor(activeSec / timeline.step));
    const px = xSec(activeSec);
    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    crosshair.setAttribute('visibility', 'visible');

    const pause = pauses.find((p) => activeSec >= p.start && activeSec <= p.start + p.duration);
    const rows = [];
    const head = document.createElement('strong');
    head.textContent = formatClock(activeSec);
    if (pause) {
      rows.push(`Pause, ${pause.duration.toFixed(1)}s`);
    } else {
      const st = timeline.pitch[i];
      if (st !== null && st !== undefined) {
        const hz = medianHz ? Math.round(medianHz * 2 ** (st / 10 / 12)) : null;
        rows.push(`Pitch ${st >= 0 ? '+' : '−'}${Math.abs(st / 10).toFixed(1)} st${hz ? ` (${hz} Hz)` : ''}`);
      }
      if (timeline.loud[i] !== null && timeline.loud[i] !== undefined) rows.push(`Loudness ${timeline.loud[i]} dB`);
      if (!rows.length) rows.push('Quiet');
    }
    tooltip.replaceChildren(head, ...rows.map((r) => { const d = document.createElement('div'); d.textContent = r; return d; }));
    tooltip.classList.remove('hidden');
    const tipW = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(Math.max(px - tipW / 2, 0), width - tipW)}px`;
    tooltip.style.top = '0px';
  }
  function hide() {
    activeSec = null;
    crosshair.setAttribute('visibility', 'hidden');
    tooltip.classList.add('hidden');
  }
  const secAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    return (((clientX - rect.left) / rect.width) * width - MARGIN.left) / plotW * durationSec;
  };

  hit.addEventListener('pointermove', (e) => showAt(secAt(e.clientX)));
  hit.addEventListener('pointerleave', () => { if (document.activeElement !== svg) hide(); });
  if (onSeek) hit.addEventListener('click', (e) => onSeek(Math.max(0, secAt(e.clientX))));
  svg.addEventListener('focus', () => showAt(activeSec ?? 0));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    const current = activeSec ?? 0;
    const moves = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: durationSec };
    if (e.key in moves) { e.preventDefault(); showAt(moves[e.key]); }
    else if ((e.key === 'Enter' || e.key === ' ') && onSeek) { e.preventDefault(); onSeek(current); }
  });

  return {
    setPlayhead(sec) {
      if (sec === null || !Number.isFinite(sec)) { playhead.setAttribute('visibility', 'hidden'); return; }
      const px = xSec(Math.min(sec, durationSec));
      playhead.setAttribute('x1', px);
      playhead.setAttribute('x2', px);
      playhead.setAttribute('visibility', 'visible');
    },
  };
}
