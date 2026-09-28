// Wrapper around the Web Speech API. Emits newly finalized text plus the current
// interim text, and survives the auto-stop some browsers apply to continuous
// recognition.

export function speechSupported() {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

// How long stop() waits for the recognizer to flush its last result.
const STOP_FLUSH_TIMEOUT_MS = 1500;

export class Transcriber {
  // onUpdate(newFinalText, interimText) — newFinalText is only the delta since
  //   the previous call, so callers can append instead of re-rendering.
  // onError(errorCode, partialTranscript) — fatal error while recording.
  constructor({ onUpdate, onError }) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = navigator.language || 'en-US';

    this.finalText = '';
    this.interim = '';
    this.active = false;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.pendingStop = null;

    this.recognition.onresult = (event) => {
      let newFinal = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // One recognition result per line: gives the analyzer clause boundaries.
          newFinal += result[0].transcript.trim() + '\n';
        } else {
          interim += result[0].transcript;
        }
      }
      this.finalText += newFinal;
      this.interim = interim;
      this.onUpdate(newFinal, interim);
    };

    this.recognition.onend = () => {
      if (this.pendingStop) {
        this.pendingStop();
        return;
      }
      // Continuous recognition still times out after silence — restart while active.
      if (!this.active) return;
      try {
        this.recognition.start();
      } catch (err) {
        this.fail(err.name || 'restart-failed');
      }
    };

    this.recognition.onerror = (event) => {
      if (!this.active) return; // late error after stop() — the session is already done
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.fail(event.error);
    };
  }

  fail(code) {
    this.active = false;
    this.onError(code, this.transcript());
  }

  transcript() {
    return (this.finalText + this.interim).trim();
  }

  start() {
    this.finalText = '';
    this.interim = '';
    this.active = true;
    this.recognition.start();
  }

  // Resolves with the full transcript once the recognizer has flushed the
  // phrase in progress. Interim text that never finalizes is kept rather than
  // dropped, so the last words before Stop still count.
  stop() {
    this.active = false;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.pendingStop = null;
        resolve(this.transcript());
      };
      this.pendingStop = finish;
      setTimeout(finish, STOP_FLUSH_TIMEOUT_MS);
      try {
        this.recognition.stop();
      } catch {
        finish();
      }
    });
  }
}
