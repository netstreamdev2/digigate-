// The licence photo decoder against the reference decoder's output for the same card. Both live in the gitignored
// fixtures.local/ folder because they are a real person's photo; assertions report counts, never pixel values.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeLicencePhoto } from '../src/documents/driver-licence';
import { decodeWaveletImage } from '../src/documents/licence-photo/wavelet-image';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures.local');
const FOLDER = join(FIXTURES, 'licence-photo');
const BARCODE = join(FIXTURES, 'driver-licence', 'licence-v2-01.bin');
const PHOTO = join(FOLDER, 'licence-v2-01.wi');
const REFERENCE = join(FOLDER, 'licence-v2-01.ref.pgm');

/** Reads the reference decoder's binary PGM. Its rows are in the codec's bottom-up order. */
function readPgm(path: string): { width: number; height: number; pixels: Uint8Array } {
  const file = new Uint8Array(readFileSync(path));
  const header = new TextDecoder().decode(file.subarray(0, 32)).split(/\s+/);
  const width = Number(header[1]);
  const height = Number(header[2]);
  return { width, height, pixels: file.subarray(file.length - width * height) };
}

describe.skipIf(!existsSync(PHOTO) || !existsSync(REFERENCE))('real licence photo', () => {
  it('decodes byte for byte like the reference decoder', () => {
    const result = decodeWaveletImage(new Uint8Array(readFileSync(PHOTO)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reference = readPgm(REFERENCE);
    expect([result.photo.width, result.photo.height]).toEqual([reference.width, reference.height]);

    let mismatches = 0;
    for (let row = 0; row < reference.height; row++) {
      for (let col = 0; col < reference.width; col++) {
        const ours = result.photo.pixels[(reference.height - 1 - row) * reference.width + col];
        if (ours !== reference.pixels[row * reference.width + col]) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it.skipIf(!existsSync(BARCODE))('decodes the same photo straight from the scanned barcode', () => {
    const fromBarcode = decodeLicencePhoto(new Uint8Array(readFileSync(BARCODE)));
    const fromPhoto = decodeWaveletImage(new Uint8Array(readFileSync(PHOTO)));
    expect(fromBarcode.ok && fromPhoto.ok).toBe(true);
    if (!fromBarcode.ok || !fromPhoto.ok) return;
    expect(Buffer.compare(fromBarcode.photo.pixels, fromPhoto.photo.pixels)).toBe(0);
  });

  it('refuses a damaged photo instead of showing a garbled one', () => {
    const bytes = new Uint8Array(readFileSync(PHOTO));
    const corrupted = bytes.slice();
    corrupted[300] = (corrupted[300] ?? 0) ^ 0x10;
    expect(decodeWaveletImage(corrupted)).toEqual({ ok: false, reason: 'damaged' });
    expect(decodeWaveletImage(bytes.subarray(0, 400))).toEqual({ ok: false, reason: 'damaged' });
  });
});
