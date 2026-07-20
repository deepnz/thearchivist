# Future Features

Ideas noted during planning — not in scope for v1.

- **Audio playback & waveform** — keep the recorded audio (MediaRecorder) alongside the
  transcript so users can listen back; waveform scrubber synced to the transcript.
- **Pace timeline** — WPM sparkline across the talk to spot rushing/dragging sections.
- **Pause analysis** — detect long silences from recognition gaps; distinguish
  strategic pauses from stalls.
- **Context-aware filler detection** — only count "like/so/well/right" when used as
  fillers, not as content words.
- **Cloud sync** — optional account with cross-device history (mirrors TheArchive's
  CloudKit pattern; would likely be a small backend or Supabase).
- **Speech drills library** — tongue twisters, pausing drills, "no filler" gauntlet
  with live buzzer.
- **Video mode** — camera recording with eye-contact/gesture notes via a vision model.
- **iOS/watchOS companion** — native capture with on-device Speech framework.
