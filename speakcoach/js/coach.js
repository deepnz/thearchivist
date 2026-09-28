// Optional AI coaching via the Claude API. BYO key, called directly from the
// browser with Anthropic's direct-browser-access opt-in header. The response is
// streamed so feedback appears as it's written instead of after a long pause.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';
const TIMEOUT_MS = 90_000;

function buildPrompt({ transcript, metrics, mode, topic }) {
  const metricSummary = [
    `Duration: ${metrics.durationSeconds}s`,
    `Words: ${metrics.wordCount}`,
    `Pace: ${metrics.wpm} WPM (target 130-170)`,
    `Fillers: ${metrics.fillerCount} total, ${metrics.fillersPerMinute}/min (${Object.entries(metrics.fillerBreakdown).map(([w, n]) => `${w}: ${n}`).join(', ') || 'none'})`,
    `Vocabulary diversity: ${metrics.vocabularyDiversity}`,
    `Longest fluent stretch: ${metrics.longestFluentStretch} words`,
  ].join('\n');

  const context = mode === 'impromptu'
    ? `This was an impromptu talk on the prompt: "${topic}".`
    : 'This was a free-form practice talk.';

  return `${context}\n\nMeasured metrics:\n${metricSummary}\n\nTranscript:\n"""\n${transcript}\n"""\n\nGive coaching feedback with exactly these sections:\nWHAT WORKED — 2 specific strengths.\nWHAT TO IMPROVE — 2 specific weaknesses (structure, clarity, opening/closing, word choice).\nONE DRILL — a single concrete exercise for the next practice session.`;
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

// Streams coaching text. onText(chunk) is called for each piece as it arrives;
// resolves with the full text.
export async function getCoaching({ apiKey, transcript, metrics, mode, topic, onText = () => {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        system: 'You are a warm, direct public-speaking coach. Ground every observation in the transcript — quote short phrases when useful. Be encouraging but honest. Format with the exact section headers requested; keep the whole response under 250 words.',
        messages: [{ role: 'user', content: buildPrompt({ transcript, metrics, mode, topic }) }],
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
        onText(event.delta.text);
      } else if (event.type === 'message_delta' && event.delta?.stop_reason === 'refusal') {
        throw new Error('The model declined to respond to this transcript.');
      } else if (event.type === 'error') {
        throw new Error(event.error?.message || 'Streaming error');
      }
    }
    return text;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out — try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
