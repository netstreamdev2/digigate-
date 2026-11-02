// Writes the three result tones to assets/sounds as small WAV files, so they're made from a recipe rather than a download
// and can be retuned here. They follow the vibration patterns: a quick rising pair for clear, two mid beeps for a warning,
// three long low blasts for a block. Run from apps/gate: node scripts/make-tones.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 16_000;
const LOUDNESS = 0.85;
const EDGE_SECONDS = 0.004;

const TONES = {
  clear: [
    { hertz: 880, seconds: 0.08 },
    { hertz: 1320, seconds: 0.13 },
  ],
  warning: [
    { hertz: 660, seconds: 0.14 },
    { hertz: 0, seconds: 0.09 },
    { hertz: 660, seconds: 0.14 },
  ],
  blocked: [
    { hertz: 330, seconds: 0.4 },
    { hertz: 0, seconds: 0.12 },
    { hertz: 330, seconds: 0.4 },
    { hertz: 0, seconds: 0.12 },
    { hertz: 330, seconds: 0.4 },
  ],
};

function samplesOf(notes) {
  const samples = [];
  for (const { hertz, seconds } of notes) {
    const count = Math.round(seconds * SAMPLE_RATE);
    const edge = Math.round(EDGE_SECONDS * SAMPLE_RATE);
    for (let index = 0; index < count; index++) {
      const time = index / SAMPLE_RATE;
      // Softened at both ends so a note starts and stops without a click. A touch of the third harmonic carries further
      // outdoors than a pure tone on a small speaker.
      const envelope = Math.min(1, index / edge, (count - index) / edge);
      const wave = hertz === 0 ? 0 : Math.sin(2 * Math.PI * hertz * time) * 0.8 + Math.sin(6 * Math.PI * hertz * time) * 0.2;
      samples.push(Math.round(wave * envelope * LOUDNESS * 32_767));
    }
  }
  return samples;
}

function wavOf(samples) {
  const dataBytes = samples.length * 2;
  const file = Buffer.alloc(44 + dataBytes);
  file.write('RIFF', 0);
  file.writeUInt32LE(36 + dataBytes, 4);
  file.write('WAVEfmt ', 8);
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(SAMPLE_RATE, 24);
  file.writeUInt32LE(SAMPLE_RATE * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write('data', 36);
  file.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => file.writeInt16LE(sample, 44 + index * 2));
  return file;
}

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
mkdirSync(folder, { recursive: true });
for (const [name, notes] of Object.entries(TONES)) {
  writeFileSync(join(folder, `result-${name}.wav`), wavOf(samplesOf(notes)));
}
