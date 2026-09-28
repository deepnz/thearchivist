# SpeakCoach — Design Spec

**Date:** 2026-07-20
**Platform:** Web (static, no build step)
**Status:** v1 shipped

---

## Overview

A single-page practice room for public speaking. The user records a talk, watches a
live transcript, and gets an instant objective analysis plus optional AI coaching.
Everything is client-side; session history lives in `localStorage`.

## Architecture

| Layer | Technology |
|---|---|
| UI | Plain HTML + CSS + ES modules |
| Speech-to-text | Web Speech API (`SpeechRecognition`), continuous + interim results; one line per final result |
| Timing | `performance.now()` session start/stop (per-word timestamps are a future feature) |
| Analysis | Pure ES module (`js/analysis.js`), unit-tested with `node --test` |
| AI coaching | Claude API (`claude-opus-4-8`) via `fetch`, BYO key, direct-browser access header |
| Persistence | `localStorage` (`speakcoach.sessions.v1`, `speakcoach.apikey.v1`) |

No backend. No dependencies. `npm test` runs the analysis test suite with Node's
built-in test runner.

## Screens / states (single page)

1. **Setup** — mode picker (Free talk / Impromptu topic), target duration
   (1 / 2 / 5 min), topic card with "shuffle" when Impromptu is selected.
2. **Recording** — big timer, pulsing record indicator, live transcript pane
   (final text solid, interim text dimmed), Stop button. If the target duration is
   reached the timer turns amber (overtime is allowed, not cut off).
3. **Results** — stat tiles (score, WPM, fillers/min, vocabulary, longest fluent
   stretch, duration), per-filler breakdown chips, rule-based tips, transcript,
   "Get AI coaching" panel, "Practice again" button.
4. **History** — list of past sessions (date, mode, duration, WPM, fillers/min,
   score, color-coded); clear-history control. A score trend chart is a future feature.

Manual fallback: a textarea + duration field so a pasted transcript can still be
analyzed. It is shown automatically when the browser has no speech API or when
recognition fails (blocked mic, no speech service), and is always reachable via
"or paste a transcript instead". Navigation is locked while recording.

## Analysis rules

- **Tokenizing** — Unicode-aware (accented and non-Latin words stay whole, curly
  apostrophes normalized). Punctuation and recognition-result line breaks mark
  clause boundaries for position-sensitive filler rules.
- **WPM** = words / minutes. Target band 130–170; scored on distance from the band.
- **Fillers** — always: um, uh, er, erm, ah, hmm, actually, basically, literally,
  "you know", "i mean". By context: "so"/"well"/"okay" at clause start (not "so that",
  "well known"); "right"/"okay" at a clause boundary; "like" unless it follows a word
  that makes it a verb/preposition ("I'd like", "looks like"); "kind of"/"sort of"
  unless after a determiner ("what kind of"). The UI notes detection is heuristic.
- **Vocabulary diversity** = moving-average type-token ratio over 50-word windows
  (plain distinct/total below 50 words), so longer talks aren't penalized.
- **Longest fluent stretch** = max consecutive words with no filler hit.
- **Score (0–100)** = 40 pts pace + 40 pts filler rate + 20 pts vocabulary.

## Claude coaching call

- `POST https://api.anthropic.com/v1/messages`, model `claude-opus-4-8`,
  `max_tokens: 2048`, `stream: true` (text renders as it arrives), 90s timeout, headers `x-api-key`, `anthropic-version: 2023-06-01`,
  `anthropic-dangerous-direct-browser-access: true`.
- Prompt includes the transcript plus computed metrics; asks for strengths,
  areas to improve, and exactly one drill for next session.
- Key stored in `localStorage`, never rendered back to the page after save.

## Visual design

"On stage" theme: near-black indigo background (#0e1116), warm spotlight amber
accent (#f5b942), off-white text, large numerals for the timer and stat tiles.
System font stack; no webfonts (keeps it dependency-free).
