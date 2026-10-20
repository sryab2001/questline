// Synthesizes Questline's sound effects into assets/sounds/*.wav.
// Run: node scripts/generate-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Mixes tones into a float buffer. Each tone: {f, start, dur, amp, decay, harmonics, detune}. */
function render(totalSec, tones) {
  const buf = new Float32Array(Math.ceil(totalSec * RATE));
  for (const t of tones) {
    const start = Math.floor(t.start * RATE);
    const len = Math.floor(t.dur * RATE);
    const attack = Math.max(1, Math.floor((t.attack ?? 0.004) * RATE));
    const harmonics = t.harmonics ?? [1];
    for (let i = 0; i < len && start + i < buf.length; i++) {
      const time = i / RATE;
      const env = Math.min(1, i / attack) * Math.exp(-time * (t.decay ?? 8));
      let s = 0;
      harmonics.forEach((h, k) => {
        s += h * Math.sin(2 * Math.PI * t.f * (k + 1) * time);
        if (t.detune) s += h * 0.6 * Math.sin(2 * Math.PI * t.f * (k + 1) * (1 + t.detune) * time);
      });
      buf[start + i] += s * env * (t.amp ?? 0.3);
    }
  }
  return buf;
}

function toWav(samples) {
  // Normalise to 85% of full scale.
  const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0) || 1;
  const gain = 0.85 / peak;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const bell = [1, 0.35, 0.12];

const sounds = {
  // Soft tick when logging progress.
  tick: render(0.06, [{ f: 1760, start: 0, dur: 0.06, amp: 0.25, decay: 70, harmonics: [1, 0.2] }]),

  // System chime: a goal is cleared.
  clear: render(0.5, [
    { f: 1318.5, start: 0, dur: 0.3, decay: 12, harmonics: bell },
    { f: 1975.5, start: 0.09, dur: 0.4, decay: 9, harmonics: bell, detune: 0.003 },
  ]),

  // Daily Quest complete: three rising notes.
  quest: render(0.9, [
    { f: 987.8, start: 0, dur: 0.3, decay: 10, harmonics: bell },
    { f: 1318.5, start: 0.11, dur: 0.3, decay: 10, harmonics: bell },
    { f: 1975.5, start: 0.22, dur: 0.65, decay: 5, harmonics: bell, detune: 0.004 },
  ]),

  // Level up: arpeggio into a shimmering held chord.
  levelup: render(1.8, [
    ...[523.25, 659.25, 783.99, 1046.5, 1318.5].map((f, i) => ({ f, start: i * 0.085, dur: 0.35, decay: 7, harmonics: bell })),
    { f: 1046.5, start: 0.45, dur: 1.3, decay: 2.2, harmonics: bell, detune: 0.004, amp: 0.22 },
    { f: 1568.0, start: 0.45, dur: 1.3, decay: 2.4, harmonics: bell, detune: 0.005, amp: 0.18 },
    { f: 2093.0, start: 0.5, dur: 1.2, decay: 2.8, harmonics: [1], detune: 0.006, amp: 0.12 },
  ]),

  // Penalty: low alternating alarm.
  penalty: render(1.1, [
    ...[0, 0.36, 0.72].flatMap((t) => [
      { f: 220, start: t, dur: 0.16, decay: 3, attack: 0.01, harmonics: [1, 0.5, 0.33, 0.25], amp: 0.35 },
      { f: 164.8, start: t + 0.17, dur: 0.16, decay: 3, attack: 0.01, harmonics: [1, 0.5, 0.33, 0.25], amp: 0.35 },
    ]),
  ]),

  // Store purchase: coin.
  purchase: render(0.45, [
    { f: 1568.0, start: 0, dur: 0.08, decay: 25, harmonics: bell },
    { f: 2093.0, start: 0.07, dur: 0.35, decay: 9, harmonics: bell },
  ]),
};

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  writeFileSync(join(OUT, `${name}.wav`), toWav(samples));
  console.log(`assets/sounds/${name}.wav  ${(samples.length / RATE).toFixed(2)}s`);
}
