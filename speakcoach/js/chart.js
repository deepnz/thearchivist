// Score-over-time chart for the History view. Plain SVG, no dependencies.
//
// Form: one series over time -> a 2px line with a 10% area wash, no legend (the
// heading names it), a direct label on the latest point only, and a crosshair
// tooltip that snaps to the nearest session. The History table below is the
// chart's table view, so no value is reachable only by hovering.

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 220;
const MARGIN = { top: 18, right: 40, bottom: 30, left: 34 };
const Y_TICKS = [0, 25, 50, 75, 100];

// Pure: sessions (any order) -> chronological points with a valid score.
export function scoreSeries(sessions) {
  return sessions
    .filter((s) => s && s.at && Number.isFinite(s.metrics?.score))
    .map((s) => ({ id: s.id, at: s.at, mode: s.mode, metrics: s.metrics, score: s.metrics.score }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Renders into `container`; onSelect(id) fires when a session is clicked or
// chosen with Enter.
export function renderScoreChart(container, sessions, { onSelect } = {}) {
  const points = scoreSeries(sessions);
  container.replaceChildren();

  if (points.length < 2) {
    const note = document.createElement('p');
    note.className = 'chart-empty';
    note.textContent = points.length === 0
      ? 'Your score trend will appear here after a couple of sessions.'
      : 'One session so far. Practice once more to start your trend line.';
    container.append(note);
    return;
  }

  const width = Math.max(280, container.clientWidth || 600);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (i) => MARGIN.left + (i * plotW) / (points.length - 1);
  const y = (v) => MARGIN.top + plotH * (1 - v / 100);
  const baseline = y(0);

  const latest = points[points.length - 1];
  const svg = el('svg', {
    width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`,
    class: 'score-chart', tabindex: '0', role: 'img',
    'aria-label': `Score over your last ${points.length} sessions, from ${points[0].score} to ${latest.score}. Use arrow keys to step through sessions and Enter to open one.`,
  });

  // Recessive hairline grid + y ticks.
  for (const tick of Y_TICKS) {
    svg.append(el('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(tick), y2: y(tick), class: 'grid' }));
    const label = el('text', { x: MARGIN.left - 8, y: y(tick), class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    label.textContent = tick;
    svg.append(label);
  }

  // X axis: first and last dates only.
  for (const [i, anchor] of [[0, 'start'], [points.length - 1, 'end']]) {
    const label = el('text', { x: x(i), y: HEIGHT - 8, class: 'tick', 'text-anchor': anchor });
    label.textContent = shortDate(points[i].at);
    svg.append(label);
  }

  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join('');
  svg.append(el('path', {
    d: `${linePath}L${x(points.length - 1).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z`,
    class: 'area',
  }));
  svg.append(el('path', { d: linePath, class: 'line' }));

  // Crosshair (hidden until hover/focus).
  const crosshair = el('line', { y1: MARGIN.top, y2: baseline, class: 'crosshair', visibility: 'hidden' });
  const focusDot = el('circle', { r: 4, class: 'dot', visibility: 'hidden' });
  svg.append(crosshair, focusDot);

  // Latest point: end-dot with a surface ring, plus the one direct label.
  svg.append(el('circle', { cx: x(points.length - 1), cy: y(latest.score), r: 4, class: 'dot' }));
  const endLabel = el('text', {
    x: x(points.length - 1) + 9, y: y(latest.score), class: 'end-label', 'dominant-baseline': 'middle',
  });
  endLabel.textContent = latest.score;
  svg.append(endLabel);

  // Full-plot hit layer: the pointer only needs to be nearest in X.
  const hit = el('rect', {
    x: MARGIN.left - 12, y: MARGIN.top, width: plotW + 24, height: plotH, class: 'hit',
  });
  svg.append(hit);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip hidden';
  tooltip.setAttribute('role', 'status');
  container.append(svg, tooltip);

  let active = null;

  function showAt(i) {
    active = i;
    const p = points[i];
    const px = x(i);
    const py = y(p.score);
    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    crosshair.setAttribute('visibility', 'visible');
    focusDot.setAttribute('cx', px);
    focusDot.setAttribute('cy', py);
    focusDot.setAttribute('visibility', 'visible');

    // Value leads; context follows. textContent only.
    const value = document.createElement('strong');
    value.textContent = p.score;
    const lines = [
      `${new Date(p.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${p.mode === 'impromptu' ? 'Impromptu' : 'Free talk'}`,
      `${p.metrics.wpm} WPM · ${p.metrics.fillersPerMinute} fillers/min`,
    ];
    tooltip.replaceChildren(value, document.createTextNode(' score'),
      ...lines.map((text) => { const d = document.createElement('div'); d.textContent = text; return d; }));
    tooltip.classList.remove('hidden');

    // Keep the tooltip inside the chart horizontally, above the point.
    const tipWidth = tooltip.offsetWidth;
    const left = Math.min(Math.max(px - tipWidth / 2, 0), width - tipWidth);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(py - tooltip.offsetHeight - 14, 0)}px`;
  }

  function hide() {
    active = null;
    crosshair.setAttribute('visibility', 'hidden');
    focusDot.setAttribute('visibility', 'hidden');
    tooltip.classList.add('hidden');
  }

  function nearestIndex(clientX) {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - MARGIN.left) / plotW) * (points.length - 1));
    return Math.min(Math.max(i, 0), points.length - 1);
  }

  hit.addEventListener('pointermove', (e) => showAt(nearestIndex(e.clientX)));
  hit.addEventListener('pointerleave', () => { if (document.activeElement !== svg) hide(); });
  hit.addEventListener('click', (e) => onSelect?.(points[nearestIndex(e.clientX)].id));

  svg.addEventListener('focus', () => showAt(active ?? points.length - 1));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    const current = active ?? points.length - 1;
    const moves = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: points.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      showAt(Math.min(Math.max(moves[e.key], 0), points.length - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(points[current].id);
    }
  });
}
