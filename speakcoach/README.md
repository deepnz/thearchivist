# SpeakCoach

A rehearsal room for public speaking that runs in your browser. Speak live or upload a
recording, and get a delivery report on pace, pauses, intonation, volume and energy, filler
words, word variety and clarity, plus a coaching note from Claude.

**Live app with microphone:** <https://deepnz.github.io/thearchivist/> (GitHub Pages; see
[Publishing to GitHub Pages](#publishing-to-github-pages)).

**Claude artifact:** <https://claude.ai/artifact/9esqfXRvoDnsESzDyqnJdc> (uploads, coaching
on the viewer's Claude account; private until shared from its Share menu).

> SpeakCoach lives in this repository (`deepnz/thearchivist`, formerly `thearchive`) on branch
> `claude/speakcoach-repo-setup-ajhrdh`. See [Moving to its own repo](#moving-to-its-own-repo).

## What it measures

| Skill | How | Needs |
|---|---|---|
| Pace | Exact words/min from a transcript; otherwise estimated from syllable rate in the audio (loudness peaks in voiced speech, de Jong & Wempe 2009), plus rushed stretches in 15 s windows | audio or transcript |
| Pauses | Silent gaps ≥ 250 ms between speech; per minute, average, long pauses (≥ 2 s), share of time silent | audio |
| Intonation | YIN pitch tracking (70–400 Hz): variability and range in semitones, flat 5 s stretches, sentences ending on a rise (upspeak) | audio |
| Volume & energy | Variation of half-second loudness during speech; sentences that fade at the end | audio |
| Filler words | Context-aware detection ("like", "so", "kind of" only in filler positions) | transcript |
| Word variety | Moving-average type-token ratio (length-independent) | transcript |
| Clarity | Speech-recognizer confidence per phrase; unclear phrases underlined | live mic with speech recognition |

Each skill gets a 0–100 score and a tip that matches its score band. The overall score is a
weighted average of the skills that could be measured for that take. Recording-quality notes
flag clipping, background noise, very quiet audio and very short takes.

All audio analysis happens in the browser (in a Web Worker); audio is never uploaded. A
5-minute recording analyzes in under a second.

## Speech prompts

Choose **Give me a prompt** to practice on a cue card instead of your own talk. Four filters,
each with an "Any" option (remembered between visits):

| Filter | Options |
|---|---|
| Category | Storytelling, Persuasion, Explain & teach, Opinion & debate, Workplace, Special occasions, Table topics, Interview answers |
| Theme | Personal growth, Work & career, Technology & the future, Travel & places, Food, arts & culture, Science & nature, Society & ethics, Fun & imagination |
| Difficulty | Warm-up (1 min prep, 1 min talk), Standard (30 s prep, 2 min), Challenge (no prep, 3 min, plus a twist such as "include one specific number") |
| Delivery | Conversational, Calm & deliberate, Energetic, Expressive storyteller, Persuasive, Formal & authoritative, Warm & sincere, Crisp & concise |

There are 124 prompts. Each category suggests the delivery styles that suit it; with
Delivery set to "Any", one of those is picked. When no prompt matches every filter, the
theme (then the difficulty) is relaxed and the card says so.

Each delivery style sets its own pace target (Calm 110–140 words/min, Energetic 150–180, and
so on), which the Pace score uses in place of the general 130–170 range, and names the skills
that make it work. The report shows a **delivery goal** verdict (hit, nearly there, missed)
from those skills, and the coaching note says whether the talk answered the prompt and, with
a transcript, whether the twist was used. Prompt takes appear in History under their category.

## Two ways to run it

**Standalone** (this folder, served over HTTP): live microphone with meters (volume, pace,
filler count, pitch trace) and live transcription in Chrome, Edge or Safari; uploads; history in
`localStorage`; coaching with your own Anthropic API key.

```bash
cd speakcoach
npx serve .        # or: python3 -m http.server 8080
```

**Claude artifact** (the shareable link): uploads and the phone's recorder app; coaching through
the viewer's own Claude account (no API key); each signed-in viewer's history saved privately to
their account. Artifacts can't use the microphone, so the mic button explains how to record a
voice memo and upload it instead.

To republish after changes:

```bash
node scripts/build-artifact.mjs dist/artifact.html   # page content + inlined CSS
```

Then publish `dist/artifact.html` with every file in `js/` alongside it (as `js/<name>.js`) and
capabilities `{ sample: {}, db: {}, user: {} }`.

## Publishing to GitHub Pages

`.github/workflows/speakcoach-pages.yml` runs the tests and publishes the app (page, CSS and
JS only) on every push to `master` or `claude/speakcoach-repo-setup-ajhrdh` that touches
`speakcoach/`. Pages serves it over HTTPS, which browsers require for microphone access.

One-time setup by a repo admin:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. To deploy from the SpeakCoach branch (not just `master`): **Settings → Environments →
   github-pages → Deployment branches and tags → Add rule** `claude/speakcoach-repo-setup-ajhrdh`.
3. Re-run the latest "Deploy SpeakCoach to Pages" run from the **Actions** tab, or push a change.

On Pages the app runs in standalone mode: live mic with meters and live words (Chrome, Edge,
Safari), history in the browser, coaching with your own Anthropic API key.

## Tests

```bash
cd speakcoach
npm test           # node --test on test/*.test.mjs
```

The acoustic tests synthesize speech-like audio with known pitch, syllable rate, pauses,
rising endings and fading volume, and check each measurement against that ground truth.

`node scripts/make-example.mjs` regenerates `js/example.js`, the sample report shown from the
practice page.

## Project layout

```
speakcoach/
├── index.html            # page; content between artifact:start/end is what gets published
├── css/styles.css        # light + dark tokens
├── js/
│   ├── acoustics.js      # pitch, pauses, syllables, loudness (pure, tested)
│   ├── analysis.js       # transcript metrics: fillers, word variety (pure, tested)
│   ├── report.js         # delivery report card and tips (pure, tested)
│   ├── audio-input.js    # file decoding, live recorder with meters, worker runner
│   ├── worker.js         # runs acoustics off the main thread
│   ├── transcription.js  # Web Speech API wrapper with per-phrase confidence
│   ├── timeline.js       # pitch + loudness timeline chart with pauses
│   ├── chart.js          # score-over-time chart
│   ├── coach.js          # Claude coaching: artifact `sample` or API key
│   ├── storage.js        # account (artifact db) or browser storage
│   ├── example.js        # generated sample report
│   ├── prompts.js        # speech prompts, themes, difficulties, delivery styles
│   └── app.js            # UI controller
├── scripts/              # build-artifact.mjs, make-example.mjs
├── test/                 # unit tests
└── docs/                 # PROMPT.md, DESIGN_SPEC.md, future-features.md
```

## Moving to its own repo

From a clone of `thearchive` with this branch checked out:

```bash
# 1. Create the empty repo (GitHub UI or CLI): github.com/deepnz/speakcoach
# 2. Split the speakcoach/ directory into its own history and push it:
git subtree split --prefix=speakcoach -b speakcoach-only
git push git@github.com:deepnz/speakcoach.git speakcoach-only:main
```
