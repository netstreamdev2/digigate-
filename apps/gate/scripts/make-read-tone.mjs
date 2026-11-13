// Writes assets/sounds/scan-read.wav: the short, bright beep DigiGate plays the moment it receives a scan, like a
// scanner's own good-read beep. Made in code so it can be remade or changed exactly. Run from apps/gate:
//   node scripts/make-read-tone.mjs
// 16 kHz, 16-bit mono, like the result tones, and no louder than them.
import { writeFileSync } from 'node:fs';

const RATE = 16_000;
const FREQUENCY = 2_700; // Where handheld scanners beep: clear over traffic, never shrill.
const LENGTH_S = 0.075;
const FADE_S = 0.006; // In and out, so it doesn't click.
const PEAK = 18_000;

const samples = Math.round(RATE * LENGTH_S);
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) {
  const t = i / RATE;
  const envelope = Math.min(1, t / FADE_S, (LENGTH_S - t) / FADE_S);
  data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * FREQUENCY * t) * PEAK * envelope), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0, 'ascii');
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8, 'ascii');
header.write('fmt ', 12, 'ascii');
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36, 'ascii');
header.writeUInt32LE(data.length, 40);

writeFileSync(new URL('../assets/sounds/scan-read.wav', import.meta.url), Buffer.concat([header, data]));
