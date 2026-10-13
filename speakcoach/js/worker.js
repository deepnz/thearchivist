// Runs the acoustic analysis off the main thread.
import { analyzeAudio } from './acoustics.js';

self.onmessage = (e) => {
  try {
    self.postMessage({ ok: true, result: analyzeAudio(e.data.samples, e.data.sampleRate) });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
