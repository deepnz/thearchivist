// Wrapper around the Web Speech API. Emits final/interim transcript updates and
// survives the auto-stop behavior some browsers apply to continuous recognition.

export function speechSupported() {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export class Transcriber {
  constructor({ onUpdate, onError }) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = navigator.language || 'en-US';

    this.finalText = '';
    this.active = false;
    this.onUpdate = onUpdate;
    this.onError = onError;

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          this.finalText += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      this.onUpdate(this.finalText, interim);
    };

    // Continuous recognition still times out after silence — restart while active.
    this.recognition.onend = () => {
      if (this.active) {
        try { this.recognition.start(); } catch { /* already restarting */ }
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.active = false;
      this.onError(event.error);
    };
  }

  start() {
    this.finalText = '';
    this.active = true;
    this.recognition.start();
  }

  stop() {
    this.active = false;
    this.recognition.stop();
    return this.finalText.trim();
  }
}
