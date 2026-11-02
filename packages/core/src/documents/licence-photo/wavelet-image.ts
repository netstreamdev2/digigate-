// Summus Wavelet Image ("WI", Corel's .wi), the format of the photo in a South African driving licence barcode.
// There is no published specification. This decoder follows the community's decompiled copy of Summus's swi32.dll
// (github.com/the-mars-rover/rsa_identification issue 2), restricted to the greyscale variant licences use, with the
// options the community decoder uses (sharpening on, smoothing and fast mode off). It is checked byte for byte
// against that decoder on a real card.
import { UnsupportedStream } from './adaptive-huffman';
import { BitReader } from './bit-reader';
import { levelCount, levelSize } from './geometry';
import { CoefficientPlane, PhotoOutOfBounds, SignificanceMap } from './planes';
import { decodeCoarsest, reconstruct } from './reconstruct';
import { decodeSignificance } from './significance';

export type Photo = {
  width: number;
  height: number;
  /** One byte per pixel, greyscale, top row first. */
  pixels: Uint8Array;
};

export type PhotoResult = { ok: true; photo: Photo } | { ok: false; reason: 'not-a-wavelet-image' | 'unsupported' | 'damaged' };

type Header = {
  version: number;
  rows: number;
  cols: number;
  bitsPerPixel: number;
  colour: boolean;
  quality: number;
  method: number;
  significanceCoder: number;
  detailCoder: number;
  contrast: number;
  detailOptionA: number;
  detailOptionB: number;
  variant: number;
};

function unary(reader: BitReader): number {
  let count = 0;
  while (reader.bits(1)) count++;
  return count;
}

/** Skips an optional block of bytes: a flag, then (in version 4) a length and that many bytes. */
function skipOptionalBlock(reader: BitReader, version: number): void {
  if (reader.bits(1) && version >= 4) {
    // Read through the codec's 8-bit reader, as the reference decoder does.
    const length = reader.bits(16);
    for (let index = 0; index < length; index++) reader.bits(8);
  }
}

function readHeader(reader: BitReader): Header | null {
  if (reader.bits(8) !== 0x57 || reader.bits(8) !== 0x49) return null;
  const version = reader.bits(8);
  const rows = (reader.bits(8) << 8) + reader.bits(8);
  const cols = (reader.bits(8) << 8) + reader.bits(8);
  const bitsPerPixel = reader.bits(5);
  const colour = reader.bits(1) !== 0;
  const quality = reader.bits(1) ? reader.bits(8) : reader.bits(16);
  const method = reader.bits(2);
  const significanceCoder = reader.bits(2);
  const detailCoder = reader.bits(2);
  const detailOptionA = unary(reader);
  const contrast = unary(reader);
  const detailOptionB = unary(reader);
  const variant = reader.bits(1);
  if (version >= 3) {
    const hasNoBackground = reader.bits(1);
    if (!hasNoBackground) {
      const bytes = colour ? 3 : Math.trunc(bitsPerPixel / 8);
      for (let index = 0; index < bytes; index++) reader.bits(8);
    }
    if (version >= 4) reader.bits(8);
    skipOptionalBlock(reader, version);
    if (version >= 4) {
      skipOptionalBlock(reader, version);
      reader.alignToByte();
    }
  }
  return { version, rows, cols, bitsPerPixel, colour, quality, method, significanceCoder, detailCoder, contrast, detailOptionA, detailOptionB, variant };
}

/** Only the combination found on licences is decoded; anything else is refused rather than guessed at. */
function isSupported(header: Header): boolean {
  return (
    header.version === 4 &&
    header.variant === 0 &&
    !header.colour &&
    header.bitsPerPixel === 8 &&
    header.method === 0 &&
    header.significanceCoder === 1 &&
    header.detailCoder === 1 &&
    header.contrast === 0 &&
    header.detailOptionA === 0 &&
    header.detailOptionB === 0 &&
    header.rows > 2 &&
    header.cols > 2
  );
}

/** Coefficients carry 5 fractional bits: round, scale to 0..255 and clamp. */
function toPixel(coefficient: number): number {
  const value = coefficient + 16;
  if (value >= 0x2000) return 255;
  if (value < 0) return 0;
  return Math.trunc(value / 32);
}

function decode(bytes: Uint8Array): PhotoResult {
  const reader = new BitReader(bytes);
  const header = readHeader(reader);
  if (!header) return { ok: false, reason: 'not-a-wavelet-image' };
  if (!isSupported(header)) return { ok: false, reason: 'unsupported' };
  const { rows, cols, quality } = header;
  const levels = levelCount(rows, cols);

  const coarsest = new CoefficientPlane(rows, cols);
  const map = new SignificanceMap(rows, cols);
  decodeCoarsest(reader, coarsest, rows, cols, levels, quality);
  let plane = coarsest;
  if (levels > 0) {
    let firstDetailLevel = unary(reader);
    if (firstDetailLevel <= levels) {
      decodeSignificance(reader, map, levelSize(rows, firstDetailLevel), levelSize(cols, firstDetailLevel), levels - firstDetailLevel);
    } else {
      reader.failed = true;
    }
    if (reader.failed) firstDetailLevel = levels;
    plane = reconstruct(reader, coarsest, map, rows, cols, levels, firstDetailLevel, quality);
  }
  if (reader.failed) return { ok: false, reason: 'damaged' };

  // The codec stores rows bottom up.
  const pixels = new Uint8Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    const target = (rows - 1 - row) * cols;
    for (let col = 0; col < cols; col++) pixels[target + col] = toPixel(plane.get(row, col));
  }
  return { ok: true, photo: { width: cols, height: rows, pixels } };
}

/** Decodes a licence photo. Damaged or unexpected data gives no photo, never a guessed one. */
export function decodeWaveletImage(bytes: Uint8Array): PhotoResult {
  try {
    return decode(bytes);
  } catch (error) {
    if (error instanceof PhotoOutOfBounds) return { ok: false, reason: 'damaged' };
    if (error instanceof UnsupportedStream) return { ok: false, reason: 'unsupported' };
    throw error;
  }
}
