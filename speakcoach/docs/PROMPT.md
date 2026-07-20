# SpeakCoach — Facilitation Prompt

**Date:** 2026-07-20
**Origin:** Chat request — "Create a new repo for speaking coach and use the chat I just responded in to facilitate the prompt and creation of the SpeakCoach app."

This document captures the prompt used to drive the creation of SpeakCoach, so the
project can be regenerated, extended, or moved to its own repository with full context.

---

## Product prompt

> Build **SpeakCoach**, a practice room for public speaking.
>
> A user should be able to:
> 1. Pick a practice mode — free talk, or an impromptu prompt ("table topic") with a
>    target duration.
> 2. Record themselves speaking, with a live timer and live transcript.
> 3. Get an instant, objective breakdown when they stop:
>    - Words per minute (pace) with a target band of 130–170 WPM
>    - Filler words ("um", "uh", "like", "you know", …) — count, rate per minute,
>      and which ones they lean on
>    - Vocabulary diversity (distinct words / total words)
>    - Longest fluent stretch (words spoken without a filler)
>    - An overall session score out of 100
> 4. Optionally get qualitative coaching from Claude — structure, clarity, opening/closing
>    strength, one concrete drill to practice — using the user's own Anthropic API key,
>    stored only in their browser.
> 5. See their session history and trend over time, stored locally (no backend, no
>    account, nothing leaves the device except the optional Claude call).
>
> Constraints:
> - Zero build step, zero runtime dependencies: plain HTML/CSS/ES modules.
> - Speech capture via the browser's Web Speech API (Chrome/Edge/Safari), with a
>   graceful "type or paste your transcript" fallback for unsupported browsers.
> - The analysis engine must be a pure module with unit tests runnable via `node --test`.

## Why these choices

- **No backend** mirrors TheArchive's philosophy (fully client-side, user owns their data).
- **Web Speech API** gives free, on-device-ish transcription with zero setup.
- **BYO Claude key** keeps the repo deployable as a static page while still offering
  real coaching; the key lives in `localStorage` and is sent only to `api.anthropic.com`.

## Out of scope for v1

See `future-features.md`.
