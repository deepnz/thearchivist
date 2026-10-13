// Audio in: decoding uploaded files and recording from the microphone, plus
// running the acoustic analysis off the main thread.

import { ANALYSIS_RATE, analyzeAudio, yin } from './acoustics.js';

export const MAX_ANALYSIS_SEC = 20 * 60;
export const MAX_FILE_BYTES = 250 * 1024 * 1024;

export function microphoneAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window.MediaRecorder !== 'undefined';
}

/**
 * Decodes any audio (or video-with-audio) the browser can play into mono
 * samples at ANALYSIS_RATE. Long recordings are trimmed to MAX_ANALYSIS_SEC.
 * @returns {Promise<{ samples: Float32Array, sampleRate: number, durationSec: number, trimmed: boolean }>}
 */
export async function decodeAudio(arrayBuffer) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('This browser cannot decode audio.');
  // Decoding through an offline context at 16 kHz resamples as it decodes.
  const ctx = new Offline(1, 1, ANALYSIS_RATE);
  let buffer;
  try {
    buffer = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p?.then) p.then(resolve, reject);
    });
  } catch {
    throw new Error("This file couldn't be read as audio. Try MP3, M4A, WAV, WebM or OGG, or a video file with sound.");
  }

  const fullSec = buffer.length / buffer.sampleRate;
  const length = Math.min(buffer.length, Math.round(MAX_ANALYSIS_SEC * buffer.sampleRate));
  const samples = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) samples[i] += data[i] / buffer.numberOfChannels;
  }
  return { samples, sampleRate: buffer.sampleRate, durationSec: fullSec, trimmed: length < buffer.length };
}

let worker = null;
let workerBroken = false;

function getWorker() {
  if (workerBroken) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

// Runs analyzeAudio in a worker (falls back to the main thread if workers
// can't start), so a long recording doesn't freeze the page.
export function runAnalysis(samples, sampleRate) {
  const w = getWorker();
  if (!w) return Promise.resolve(analyzeAudio(samples, sampleRate));
  return new Promise((resolve, reject) => {
    const cleanup = () => { w.onmessage = null; w.onerror = null; };
    w.onmessage = (e) => {
      cleanup();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      // The worker couldn't load (blocked or unsupported): analyze inline.
      e.preventDefault?.();
      cleanup();
      workerBroken = true;
      worker = null;
      try { resolve(analyzeAudio(samples, sampleRate)); } catch (err) { reject(err); }
    };
    const copy = samples.slice(); // keep the caller's copy usable
    w.postMessage({ samples: copy, sampleRate }, [copy.buffer]);
  });
}

/**
 * Microphone recording with live meters. Call start(), then stop() to get the
 * recording as a Blob.
 *
 * onLevel({ db, hz, syllablesPerSec }) fires about 30 times a second:
 *   db  — current loudness in dBFS
 *   hz  — current pitch, or 0 when unvoiced/silent
 *   syllablesPerSec — rolling syllable rate over the last 8 s (rough)
 */
export class LiveRecorder {
  constructor({ onLevel }) {
    this.onLevel = onLevel;
    this.chunks = [];
    this.history = []; // { t, db } for the rolling syllable count
    this.raf = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);

    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.lastEmit = 0;
    this.loop();
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now();
    if (now - this.lastEmit < 33) return;
    this.lastEmit = now;

    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const db = 20 * Math.log10(Math.max(Math.sqrt(sum / this.buf.length), 1e-6));

    // Pitch on a decimated copy (~8–12 kHz) to keep YIN cheap.
    const factor = Math.max(1, Math.floor(this.ctx.sampleRate / 8000));
    const rate = this.ctx.sampleRate / factor;
    const small = new Float32Array(Math.floor(this.buf.length / factor));
    for (let i = 0; i < small.length; i++) small[i] = this.buf[i * factor];
    const size = Math.round(rate * 0.025);
    const hz = db > -50 ? yin(small, 0, size, rate) : 0;

    const t = (now - this.startedAt) / 1000;
    this.history.push({ t, db, voiced: hz > 0 });
    while (this.history.length && this.history[0].t < t - 8) this.history.shift();
    this.onLevel({ db, hz: hz >= 70 && hz <= 400 ? hz : 0, syllablesPerSec: this.rollingSyllableRate(t) });
  }

  // Counts loudness peaks with a 3 dB dip, in voiced sound above the room's
  // quiet level, over the last 8 seconds. A live hint, not the final number.
  rollingSyllableRate(t) {
    const h = this.history;
    if (h.length < 30 || t < 3) return null;
    const sorted = h.map((x) => x.db).sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.1)];
    const gate = floor + 10;
    let peaks = 0;
    let lastPeak = -Infinity;
    let dip = Infinity;
    for (let i = 1; i < h.length - 1; i++) {
      dip = Math.min(dip, h[i].db);
      const isPeak = h[i].db > h[i - 1].db && h[i].db >= h[i + 1].db && h[i].db > gate && h[i].voiced;
      if (isPeak && h[i].db - dip >= 3 && h[i].t - lastPeak > 0.1) {
        peaks++;
        lastPeak = h[i].t;
        dip = Infinity;
      }
    }
    const span = Math.min(8, t);
    return peaks / span;
  }

  // Resolves with the recorded Blob once the recorder has flushed.
  stop() {
    cancelAnimationFrame(this.raf);
    return new Promise((resolve) => {
      const finish = () => {
        this.stream.getTracks().forEach((track) => track.stop());
        this.ctx.close().catch(() => {});
        resolve(new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' }));
      };
      if (this.recorder.state === 'inactive') finish();
      else {
        this.recorder.onstop = finish;
        this.recorder.stop();
      }
    });
  }

  // Abandons the recording (navigating away, errors).
  cancel() {
    cancelAnimationFrame(this.raf);
    try { this.recorder?.stop(); } catch { /* already stopped */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.ctx?.close().catch(() => {});
  }
}
