// Renders the "Voice of the World" announcer lines: an original, calm system voice
// (Kokoro-82M, Apache-2.0, run locally) with a light echo, written to
// assets/sounds/voice/*.wav. Lines are our own wording, not quotes.
//
//   cd scripts/voice && npm install && node generate.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KokoroTTS } from 'kokoro-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets', 'sounds', 'voice');
mkdirSync(OUT, { recursive: true });

const VOICE = 'bf_emma';
const SPEED = 0.9;

// Keys match VoiceName in src/sound/index.ts.
export const LINES = {
  daily: 'Notice. The Daily Quest is complete. Rewards have been granted.',
  levelup: 'Notice. Your level has increased.',
  title: 'Notice. Conditions have been met. A new title has been acquired.',
  item: 'Confirmed. Item acquired.',
  boss: 'Notice. The boss has been defeated. Chapter cleared.',
  penalty: 'Warning. The Daily Quest was not completed. A penalty has been applied.',
  arise: 'Confirmed. Extraction successful. A new shadow has risen.',
  job: 'Notice. Job change complete.',
  dungeon: 'Notice. The dungeon has been cleared.',
  routine: 'Confirmed. Routine complete.',
  bounty: 'Notice. Bounty earned. You may claim your reward.',
};

/** Mono float samples → 16-bit PCM WAV. */
function wav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** A soft, roomy echo and a short fade, then normalise to -1 dBFS. */
function systemVoice(input, rate) {
  const taps = [
    [0.07, 0.22],
    [0.14, 0.12],
    [0.23, 0.06],
  ];
  const tail = Math.round(0.3 * rate);
  const out = new Float32Array(input.length + tail);
  out.set(input);
  for (const [sec, gain] of taps) {
    const d = Math.round(sec * rate);
    for (let i = 0; i < input.length; i++) out[i + d] += input[i] * gain;
  }
  const fade = Math.round(0.08 * rate);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
for (const [name, text] of Object.entries(LINES)) {
  const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
  writeFileSync(join(OUT, `${name}.wav`), wav(systemVoice(audio.audio, audio.sampling_rate), audio.sampling_rate));
  console.log(`voice/${name}.wav  ${(audio.audio.length / audio.sampling_rate).toFixed(1)}s`);
}
