// AI coaching. Two ways to reach Claude:
// - Inside a Claude artifact: the `sample` capability, on the viewer's own
//   Claude account (they're asked once to allow it). No API key needed.
// - Standalone: the Claude API with the user's own key, streamed over SSE.
// Both send the same prompt, built from the measurements and transcript.

import { formatClock } from './report.js';
import { CATEGORY, DIFFICULTY, DELIVERY } from './prompts.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';
const TIMEOUT_MS = 90_000;

let samplePromise = null;
function getSample() {
  if (!samplePromise) {
    const claude = typeof window !== 'undefined' ? window.claude : undefined;
    samplePromise = claude?.use ? claude.use('sample').catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

// Resolves "claude" (no key needed), or "key" (standalone: user supplies a key).
export async function coachingMode() {
  return (await getSample()) ? 'claude' : 'key';
}

export function buildPrompt(session) {
  const { report, acoustic, metrics, transcript, mode, topic, source, prompt } = session;
  const lines = [];
  if (prompt) {
    const cat = CATEGORY[prompt.category];
    const diff = DIFFICULTY[prompt.difficulty];
    const delivery = DELIVERY[prompt.delivery];
    lines.push(`This was a ${diff?.label ?? ''} ${cat?.label ?? ''} practice speech on the prompt: "${prompt.text}"`);
    if (delivery) lines.push(`Delivery goal: ${delivery.label}. ${delivery.cue} (Pace target ${delivery.pace.min}–${delivery.pace.max} words/min.)`);
    if (prompt.twist) lines.push(`Challenge twist the speaker was asked to work in: ${prompt.twist}`);
    const goal = report?.deliveryGoal;
    if (goal?.score !== null && goal?.score !== undefined) {
      lines.push(`Delivery goal result: ${goal.verdict} (${goal.items.map((i) => `${i.label} ${i.score}/100`).join(', ')}).`);
    }
  } else {
    lines.push(mode === 'impromptu' && topic
      ? `This was an impromptu practice talk on the prompt: "${topic}".`
      : 'This was a practice talk.');
  }
  if (source === 'upload') lines.push('The speaker uploaded a recording of it.');

  lines.push('', 'Delivery report (each skill scored 0–100):');
  for (const item of report?.items ?? []) {
    lines.push(`- ${item.label}: ${item.score}/100 — ${item.value} ${item.unit}; ${item.detail}`);
  }
  lines.push(`Overall: ${report?.score ?? '—'}/100`);

  if (acoustic?.speechFound) {
    const a = acoustic;
    lines.push('', 'Audio measurements:');
    lines.push(`- Length ${formatClock(a.durationSec)}, speaking ${formatClock(a.speakingSec)}, ${a.phrases} phrases`);
    lines.push(`- ${a.pauses.count} pauses (${a.pauses.perMinute}/min, average ${a.pauses.meanSec}s, longest ${a.pauses.longestSec}s, ${a.pauses.longCount} over 2s)`);
    if (a.pitch) lines.push(`- Pitch median ${a.pitch.medianHz} Hz, variability ±${a.pitch.variabilitySt} semitones, range ${a.pitch.rangeSt} st; ${Math.round((a.pitch.risingEndShare ?? 0) * 100)}% of sentences end rising; ${Math.round((a.pitch.monotoneShare ?? 0) * 100)}% of 5-second stretches flat`);
    lines.push(`- Volume emphasis ${a.loudness.emphasisDb} dB; ${Math.round((a.loudness.fadingEndShare ?? 0) * 100)}% of sentences fade at the end`);
    const fast = (a.pace.windows ?? []).filter((w) => w.estWpm > 195).map((w) => formatClock(w.start));
    if (fast.length) lines.push(`- Rushed stretches start at ${fast.join(', ')}`);
  }
  if (metrics?.fillerCount) {
    lines.push(`- Fillers: ${Object.entries(metrics.fillerBreakdown).map(([w, n]) => `"${w}" ×${n}`).join(', ')}`);
  }

  if (transcript) {
    lines.push('', 'Transcript:', '"""', transcript.slice(0, 20000), '"""');
  } else {
    lines.push('', 'There is no transcript, so judge delivery only, not content.');
  }

  lines.push(
    '',
    'You are a warm, direct public-speaking coach. You cannot hear the audio: base delivery feedback on the measurements above and never claim to have listened. Ground content feedback in the transcript and quote short phrases when useful. Be encouraging and specific.',
    'Write plain text (no markdown symbols) with exactly these three sections, each starting on its own line with the heading in capitals:',
    'WHAT WORKED: 2 specific strengths.',
    'WHAT TO WORK ON: the 2 changes that would most improve this talk, each with how to do it.',
    ...(prompt ? [
      'Within these sections, say whether the delivery matched the delivery goal, and whether the talk answered the prompt.',
      ...(prompt.twist ? [transcript ? 'Say whether the twist was used, based on the transcript.' : 'There is no transcript, so do not judge whether the twist was used.'] : []),
    ] : []),
    'ONE DRILL: a single concrete exercise for the next practice session, under 60 words.',
    'Keep the whole response under 260 words.',
  );
  return lines.join('\n');
}

// Plain-language copy for each failure the viewer can act on.
function sampleErrorMessage(code) {
  switch (code) {
    case 'not_granted': return 'Claude is turned off for this page. You can allow it from the page\'s permissions menu.';
    case 'sampling_disabled': return 'Claude isn\'t available on this account.';
    case 'rate_limited': return 'You\'ve reached a usage limit for now. Try again in a little while.';
    case 'session_expired': return 'Your Claude session expired. Sign in again, then retry.';
    case 'refused': return 'Claude declined to coach on this transcript.';
    default: return 'Coaching was interrupted. Try again.';
  }
}

/**
 * Streams coaching for a session.
 * onText(wholeTextSoFar) is called as the answer is written.
 */
export async function getCoaching(session, { apiKey, onText = () => {}, signal, fresh = false } = {}) {
  const prompt = buildPrompt(session);
  const sample = await getSample();

  if (sample) {
    try {
      const { text } = await sample(prompt, {
        signal,
        cache: fresh ? false : true,
        onText: ({ text: whole }) => onText(whole),
      });
      return text;
    } catch (e) {
      if (e?.code === 'cancelled') throw Object.assign(new Error('Stopped.'), { partial: e.text });
      throw Object.assign(new Error(sampleErrorMessage(e?.code)), { partial: e?.text, permanent: ['not_granted', 'sampling_disabled', 'not_declared'].includes(e?.code) });
    }
  }

  if (!apiKey) throw new Error('Enter your Anthropic API key first.');
  return streamWithKey(prompt, apiKey, onText, signal);
}

// Yields parsed SSE `data:` payloads from a fetch response body.
async function* sseEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (data) yield JSON.parse(data);
    }
  }
}

async function streamWithKey(prompt, apiKey, onText, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || `HTTP ${response.status}`);
    }

    let text = '';
    for await (const event of sseEvents(response.body)) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        text += event.delta.text;
        onText(text);
      } else if (event.type === 'message_delta' && event.delta?.stop_reason === 'refusal') {
        throw new Error('Claude declined to coach on this transcript.');
      } else if (event.type === 'error') {
        throw new Error(event.error?.message || 'Streaming error');
      }
    }
    return text;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'Stopped.' : 'Request timed out. Try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
