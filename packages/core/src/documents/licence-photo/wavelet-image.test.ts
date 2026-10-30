import { describe, expect, it } from 'vitest';

import { decodeWaveletImage } from './wavelet-image';

// The decoder itself is checked byte for byte against the reference decoder on a real card, in local-tests (real
// photos are personal information). These tests cover the header, using only made-up bytes.
const SIGNATURE = [0x57, 0x49];
const SIZE = [0x00, 0xfa, 0x00, 0xc8];
// 8 bits per pixel, greyscale, quality 0x93, the licence coders, no options, no background, no comment or extension.
const SETTINGS = [0x43, 0x26, 0x28, 0x40, 0x00];

describe('decodeWaveletImage', () => {
  it('refuses data that is not a wavelet image', () => {
    expect(decodeWaveletImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toEqual({ ok: false, reason: 'not-a-wavelet-image' });
  });

  it('refuses versions it has not been checked against', () => {
    expect(decodeWaveletImage(Uint8Array.from([...SIGNATURE, 0x03, ...SIZE, ...SETTINGS]))).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('refuses colour images', () => {
    const colour = [(SETTINGS[0] ?? 0) | 0b0000_0100, ...SETTINGS.slice(1)];
    expect(decodeWaveletImage(Uint8Array.from([...SIGNATURE, 0x04, ...SIZE, ...colour]))).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports a photo that stops after its header as damaged', () => {
    expect(decodeWaveletImage(Uint8Array.from([...SIGNATURE, 0x04, ...SIZE, ...SETTINGS]))).toEqual({ ok: false, reason: 'damaged' });
  });
});
