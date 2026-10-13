# Future Features

Ideas noted during planning, not yet built.

- **Transcribe uploaded recordings** — run a small speech-recognition model (for example
  Whisper) in the browser so uploads get filler words, word variety and exact pace without
  pasting a transcript. In the artifact this needs the model files published with the page.
- **Pronunciation scoring** — compare what was said against an expected script, word by word.
  Today clarity is only the live recognizer's confidence.
- **Keep audio with past takes** — store recordings (artifact `assets` or IndexedDB) so the
  timeline can play back old takes, not just the latest.
- **Script mode** — paste the talk you meant to give and see where you went off-script.
- **Cloud sync for the standalone app** — the artifact already saves per account.
- **Speech drills library** — tongue twisters, pausing drills, a "no filler" gauntlet.
- **Video mode** — eye contact and gesture notes from a camera recording.
- **iOS/watchOS companion** — native capture with the on-device Speech framework.
