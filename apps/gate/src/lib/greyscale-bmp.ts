import type { Photo } from '@digigate/core';

import { toBase64 } from './bytes';

const FILE_HEADER = 14;
const INFO_HEADER = 40;
const PALETTE = 256 * 4;

/** Wraps greyscale pixels in an 8-bit BMP with a grey palette, which Android shows without an image library. */
export function greyscaleBmp({ width, height, pixels }: Photo): Uint8Array {
  const rowBytes = Math.ceil(width / 4) * 4;
  const offset = FILE_HEADER + INFO_HEADER + PALETTE;
  const bmp = new Uint8Array(offset + rowBytes * height);
  const view = new DataView(bmp.buffer);
  bmp.set([0x42, 0x4d], 0);
  view.setUint32(2, bmp.length, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, INFO_HEADER, true);
  view.setInt32(18, width, true);
  // A positive height means rows are stored bottom up.
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 8, true);
  view.setUint32(34, rowBytes * height, true);
  view.setUint32(46, 256, true);
  for (let grey = 0; grey < 256; grey++) bmp.set([grey, grey, grey, 0], FILE_HEADER + INFO_HEADER + grey * 4);
  for (let row = 0; row < height; row++) {
    bmp.set(pixels.subarray(row * width, (row + 1) * width), offset + (height - 1 - row) * rowBytes);
  }
  return bmp;
}

export function greyscaleBmpUri(photo: Photo): string {
  return `data:image/bmp;base64,${toBase64(greyscaleBmp(photo))}`;
}
