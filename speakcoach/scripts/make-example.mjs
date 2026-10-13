// Generates js/example.js: the "See a sample report" session.
// It runs the real analyzer on a synthesized two-minute take (a voice-like
// signal with natural pitch movement, one rushed stretch, a few rising
// sentence endings and one long pause), paired with a matching transcript.
// Run: node scripts/make-example.mjs
import { writeFileSync } from 'node:fs';
import { analyzeAudio, ANALYSIS_RATE as SR } from '../js/acoustics.js';
import { analyze } from '../js/analysis.js';

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const TRANSCRIPT = `So, today I want to talk about why practice out loud beats practice in your head.
Most of us rehearse a talk by reading our notes silently, um, maybe once or twice.
But the words you think and the words you say are, like, two different things.
When you speak, you find the sentences that are too long to say in one breath.
You find the transitions that sound abrupt, and the jokes that need a beat before the punchline.
I learned this the hard way at my first conference talk.
I had read my slides a dozen times, and I still ran out of breath on slide three.
So here is what I do now. I record a full run through on my phone, um, every single time.
Then I listen back once, at normal speed, and I write down only the moments where I lost the thread.
Usually it is the same two or three places, and that is where I rehearse.
The second thing is pauses. A pause feels endless to you, and it feels confident to the audience.
And here is the strange part. The audience never notices the pauses you were worried about.
They notice when you rush, and they notice when your voice trails away at the end of a sentence.
So I mark every full stop in my notes with a little slash, and I treat each one as a breath.
And the last thing is energy. Pick the one sentence on each slide that matters, and land it.
Say it a little slower, say it a little louder, and then stop talking for a second.
That one second of silence tells people this is the part to remember.
None of this takes long. A run through of a ten minute talk takes ten minutes.
Listening back takes ten more, and fixing the three rough spots maybe twenty.
That is less time than most of us spend, like, adjusting fonts on our slides.
So, record yourself this week. Basically, three runs, out loud, and see what changes.`;

// Phrase plan: seconds of speech, pause after, syllables/s, ending shape.
const phrases = [];
for (let i = 0; i < 28; i++) {
  const rushed = i >= 14 && i <= 17; // a nervous stretch in the middle
  phrases.push({
    sec: 2.6 + rand() * 2.4,
    pauseAfter: i === 9 ? 2.7 : 0.35 + rand() * 0.6,
    sps: rushed ? 6.6 : 3.6 + rand() * 0.6,
    ending: i % 5 === 1 || i % 5 === 3 ? 'rise' : 'fall',
    gainTail: i % 3 === 1 ? 0.35 : 1,
    level: 0.55 + rand() * 0.8, // phrase-to-phrase emphasis
  });
}

const total = 0.6 + phrases.reduce((s, p) => s + p.sec + p.pauseAfter, 0) + 0.6;
const out = new Float32Array(Math.round(total * SR));
for (let i = 0; i < out.length; i++) out[i] = (rand() - 0.5) * 0.002;

let t0 = 0.6;
let drift = 0;
for (const p of phrases) {
  const start = Math.round(t0 * SR);
  const n = Math.round(p.sec * SR);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    drift += (rand() - 0.5) * 0.0004;
    drift *= 0.99995;
    let st = 2.6 * Math.sin(2 * Math.PI * 0.45 * (t0 + t)) + 1.2 * Math.sin(2 * Math.PI * 1.3 * t) + drift * 40;
    const tailStart = p.sec - 0.45;
    if (t > tailStart) st += (p.ending === 'rise' ? 4.5 : -3) * ((t - tailStart) / 0.45);
    const f0 = 132 * 2 ** (st / 12);
    phase += (2 * Math.PI * f0) / SR;
    const syl = 0.12 + 0.88 * Math.sin(Math.PI * ((t * p.sps) % 1)) ** 2;
    const gain = p.level * (t > p.sec * 0.75 ? p.gainTail : 1) * syl * 0.24;
    out[start + i] += gain * (Math.sin(phase) + 0.45 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase));
  }
  t0 += p.sec + p.pauseAfter;
}

const acoustic = analyzeAudio(out, SR);
const { timeline, ...summary } = acoustic;
const metrics = analyze(TRANSCRIPT, acoustic.talkSec);
const fastest = [...summary.pace.windows].sort((a, b) => b.estWpm - a.estWpm)[0];
const rushedAt = `${Math.floor(fastest.start / 60)}:${String(Math.round(fastest.start % 60)).padStart(2, '0')}`;
const rushedWpm = fastest.estWpm;

const session = {
  id: 'example',
  at: '2026-10-06T16:30:00.000Z',
  source: 'upload',
  fileName: 'conference-talk-rehearsal.m4a',
  mode: 'free',
  topic: null,
  durationSec: Math.round(acoustic.durationSec),
  transcript: TRANSCRIPT,
  metrics,
  clarity: null,
  acoustic: summary,
  timeline,
  coaching: `WHAT WORKED:
You open with a clear promise ("why practice out loud beats practice in your head") and back it with a personal story, which makes the advice feel earned. Your pauses are well judged too: ${summary.pauses.perMinute} a minute, mostly short, with one longer beat after the conference story.

WHAT TO WORK ON:
First, the talk speeds up sharply around ${rushedAt}, to roughly ${rushedWpm} words a minute. Slow down there on purpose and give each sentence a full stop. Second, ${Math.round(summary.pitch.risingEndShare * 100)}% of your sentences end on a rise and ${Math.round(summary.loudness.fadingEndShare * 100)}% fade in volume, which undercuts lines like "land it." Finish claims with a downward, full-volume ending.

ONE DRILL:
Read the conference story aloud three times. On each run, pause for a full breath after every sentence and say the last three words of each sentence a little louder. Record the third run and compare its pace with today's.`,
};

const body = `// Generated by scripts/make-example.mjs — the "See a sample report" take.
// Measurements come from the real analyzer run on a synthesized voice.
import { buildReport } from './report.js';

const session = ${JSON.stringify(session)};
session.report = buildReport({ text: session.metrics, acoustic: { ...session.acoustic, timeline: session.timeline } });
session.score = session.report.score;

export const EXAMPLE_SESSION = session;
`;
writeFileSync(new URL('../js/example.js', import.meta.url), body);
console.log(`rising ${summary.pitch.risingEndShare}, fading ${summary.loudness.fadingEndShare}, emphasis ${summary.loudness.emphasisDb} dB, fastest window ${rushedAt} ${rushedWpm}`);
console.log(`example: ${summary.durationSec}s, ${summary.pauses.count} pauses, est ${summary.pace.estWpm} wpm, exact ${metrics.wpm} wpm, ${metrics.fillerCount} fillers, ${(body.length / 1024).toFixed(1)} KB`);
