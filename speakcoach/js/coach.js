// Optional AI coaching via the Claude API. BYO key, called directly from the
// browser with Anthropic's direct-browser-access opt-in header.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';

export async function getCoaching({ apiKey, transcript, metrics, mode, topic }) {
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: 'You are a warm, direct public-speaking coach. Ground every observation in the transcript — quote short phrases when useful. Be encouraging but honest. Format with the exact section headers requested; keep the whole response under 250 words.',
      messages: [{
        role: 'user',
        content: `${context}\n\nMeasured metrics:\n${metricSummary}\n\nTranscript:\n"""\n${transcript}\n"""\n\nGive coaching feedback with exactly these sections:\nWHAT WORKED — 2 specific strengths.\nWHAT TO IMPROVE — 2 specific weaknesses (structure, clarity, opening/closing, word choice).\nONE DRILL — a single concrete exercise for the next practice session.`,
      }],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('The model declined to respond to this transcript.');
  }
  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
