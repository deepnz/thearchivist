# 🎤 SpeakCoach

A practice room for public speaking that runs entirely in your browser. Record a talk,
watch the live transcript, and get an instant breakdown of your pace, filler words,
and vocabulary — plus optional AI coaching from Claude.

> **Note:** SpeakCoach lives in this repository (`deepnz/thearchive`) on branch
> `claude/speakcoach-repo-setup-ajhrdh` because the automation token couldn't create a
> new repository. See [Moving to its own repo](#moving-to-its-own-repo) below for the
> one-minute split.

## Features

- **Two practice modes** — free talk, or an impromptu "table topic" with a shuffle button
- **Live transcription** — Web Speech API (Chrome / Edge / Safari), with a paste-a-transcript
  fallback for other browsers
- **Instant analysis** — words per minute (target 130–170), filler words per minute with a
  per-filler breakdown, vocabulary diversity, longest fluent stretch, and a 0–100 score
- **Rule-based coaching tips** — plus optional qualitative coaching from Claude
  (`claude-opus-4-8`) using your own API key, stored only in your browser
- **Session history** — saved in `localStorage`; nothing leaves your device except the
  optional Claude call

## Running it

No build step, no dependencies. Because it uses ES modules, serve it over HTTP:

```bash
cd speakcoach
npx serve .        # or: python3 -m http.server 8080
```

Then open the printed URL in Chrome, Edge, or Safari and allow microphone access.

## Tests

The analysis engine is a pure module with unit tests on Node's built-in runner:

```bash
cd speakcoach
npm test           # runs node --test test/analysis.test.mjs
```

## AI coaching setup

1. Get an API key at <https://platform.claude.com>.
2. Finish a session, paste the key into the "AI coaching" panel, and click
   **Get AI coaching**.
3. The key is stored in `localStorage` and sent only to `api.anthropic.com`
   (using Anthropic's direct-browser-access header). Clear it by clearing site data.

## Project layout

```
speakcoach/
├── index.html          # single page, four views (setup/recording/results/history)
├── css/styles.css      # "on stage" theme
├── js/
│   ├── analysis.js     # pure analysis engine (tested)
│   ├── transcription.js# Web Speech API wrapper with auto-restart
│   ├── coach.js        # Claude API call (BYO key)
│   ├── storage.js      # localStorage sessions + key
│   ├── prompts.js      # impromptu topics
│   └── app.js          # UI controller
├── test/analysis.test.mjs
└── docs/               # PROMPT.md (origin prompt), DESIGN_SPEC.md, future-features.md
```

## Moving to its own repo

From a clone of `thearchive` with this branch checked out:

```bash
# 1. Create the empty repo (GitHub UI or CLI): github.com/deepnz/speakcoach
# 2. Split the speakcoach/ directory into its own history and push it:
git subtree split --prefix=speakcoach -b speakcoach-only
git push git@github.com:deepnz/speakcoach.git speakcoach-only:main
```
