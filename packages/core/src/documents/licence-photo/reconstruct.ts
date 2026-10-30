import { AdaptiveHuffman } from './adaptive-huffman';
import type { BitReader } from './bit-reader';
import { addDetail } from './detail-stencil';
import { BANDS, bandRect, levelSize } from './geometry';
import { CoefficientPlane, SIGNIFICANT, UNKNOWN, type SignificanceMap } from './planes';

/**
 * The coarsest picture: a small grid sent as fixed-width numbers around an offset. Each value v becomes an odd
 * multiple of the step, (2v + 1) or (2v - 1), and 0 becomes one step.
 */
export function decodeCoarsest(reader: BitReader, plane: CoefficientPlane, rows: number, cols: number, levels: number, quality: number): void {
  const coarseRows = levelSize(rows, levels);
  const coarseCols = levelSize(cols, levels);
  const width = reader.bits(5);
  const offset = width > 0 ? reader.bits(width) : 0;
  const step = quality * 32;
  for (let row = 0; row < coarseRows; row++) {
    for (let col = 0; col < coarseCols; col++) {
      const value = (width > 0 ? reader.bits(width) : 0) - offset;
      plane.set(row, col, value > 0 ? (value * 2 + 1) * step : value === 0 ? step : (value * 2 - 1) * step);
    }
  }
}

/**
 * Doubles the picture from the next coarser level to this one, in place, working backwards from the bottom right
 * so nothing is overwritten before it is read. New samples average their neighbours.
 */
function upsample(plane: CoefficientPlane, rows: number, cols: number, level: number): void {
  const targetRows = levelSize(rows, level);
  const targetCols = levelSize(cols, level);
  const evenRows = (targetRows - 1) % 2;
  const evenCols = (targetCols - 1) % 2;
  const sourceRows = Math.trunc((targetRows + 2) / 2);
  const sourceCols = Math.trunc((targetCols + 2) / 2);

  if (evenRows) {
    // An even number of rows leaves the last row with no row below it.
    const row = targetRows - 1;
    const sourceRow = sourceRows - 1;
    let source = sourceCols - 1;
    let target = targetCols - 1;
    if (evenCols) {
      plane.set(row, target--, Math.trunc((plane.get(sourceRow, source--) + 1) / 2));
    }
    let previous = plane.get(sourceRow, source--) + 1;
    plane.set(row, target--, Math.trunc(previous / 2));
    for (let count = sourceCols - evenCols - 1; count > 0; count--) {
      const current = plane.get(sourceRow, source--) + 1;
      plane.set(row, target--, Math.trunc((previous + current) / 4));
      plane.set(row, target--, Math.trunc(current / 2));
      previous = current;
    }
  }

  {
    const row = targetRows - evenRows - 1;
    const sourceRow = sourceRows - evenRows - 1;
    let source = sourceCols - 1;
    let target = targetCols - 1;
    if (evenCols) {
      plane.set(row, target--, Math.trunc((plane.get(sourceRow, source--) + 1) / 2));
    }
    let previous = plane.get(sourceRow, source--) + 1;
    plane.set(row, target--, previous >> 1);
    for (let count = sourceCols - evenCols - 1; count > 0; count--) {
      const current = plane.get(sourceRow, source--) + 1;
      plane.set(row, target--, (previous + current) >> 2);
      plane.set(row, target--, current >> 1);
      previous = current;
    }
  }

  for (let pair = sourceRows - evenRows - 1; pair > 0; pair--) {
    const evenRow = (pair - 1) * 2;
    const oddRow = evenRow + 1;
    const above = pair - 1;
    const below = pair;
    let evenTarget = targetCols - 1;
    let oddTarget = targetCols - 1;
    let source = sourceCols - 1;
    if (evenCols) {
      const current = plane.get(above, source) + 1;
      plane.set(oddRow, oddTarget--, (plane.get(below, source) + 1 + current) >> 2);
      plane.set(evenRow, evenTarget--, current >> 1);
      source--;
    }
    let previous = plane.get(above, source) + 1;
    plane.set(evenRow, evenTarget--, previous >> 1);
    let column = plane.get(below, source) + previous + 1;
    plane.set(oddRow, oddTarget--, column >> 2);
    source--;
    for (let count = sourceCols - evenCols - 2; count > 0; count--) {
      const current = plane.get(above, source) + 1;
      plane.set(evenRow, evenTarget--, (previous + current) >> 2);
      plane.set(evenRow, evenTarget--, current >> 1);
      plane.set(oddRow, oddTarget--, (column + current + plane.get(below, source) + 1) >> 3);
      plane.set(oddRow, oddTarget, (current + plane.get(below, source) + 1) >> 2);
      column = current + plane.get(below, source) + 1;
      oddTarget--;
      previous = current;
      source--;
    }
    const current = plane.get(above, source) + 1;
    plane.set(evenRow, evenTarget--, (previous + current) >> 2);
    plane.set(oddRow, oddTarget--, (column + current + plane.get(below, source) + 1) >> 3);
    plane.set(oddRow, oddTarget, (current + plane.get(below, source) + 1) >> 2);
    plane.set(evenRow, evenTarget, current >> 1);
  }
}

/** Sharpens a picture into a new plane: each inner sample becomes (12x minus its four neighbours) / 8. */
function sharpen(source: CoefficientPlane, target: CoefficientPlane, rows: number, cols: number): void {
  for (let col = 0; col < cols; col++) target.set(0, col, source.get(0, col));
  for (let col = 0; col < cols; col++) target.set(rows - 1, col, source.get(rows - 1, col));
  let next = 0;
  for (let row = rows - 2; row > 0; row--) {
    let left = source.get(row, 0);
    target.set(row, 0, left);
    let centre = source.get(row, 1);
    let col = 1;
    for (let count = cols - 2; count > 0; count--, col++) {
      next = source.get(row, col + 1);
      target.set(row, col, (centre * 12 - left - next - source.get(row + 1, col) - source.get(row - 1, col)) >> 3);
      left = centre;
      centre = next;
    }
    target.set(row, col, next);
  }
}

/** Reads one level's detail coefficients and adds each one to the picture. */
function decodeDetails(reader: BitReader, plane: CoefficientPlane, map: SignificanceMap, rows: number, cols: number, level: number, quality: number): void {
  const rawBits = reader.bits(5);
  if (rawBits > 10) {
    reader.failed = true;
    return;
  }
  const model = new AdaptiveHuffman(0x800, 3);
  const whole = bandRect(rows, cols, level, 2);
  for (const band of BANDS) {
    const rect = bandRect(rows, cols, level, band);
    for (let row = rect.rowStart; row < rect.rowEnd; row++) {
      for (let col = rect.colStart; col < rect.colEnd; col++) {
        const state = map.get(row, col);
        if (state === UNKNOWN) continue;
        const negative = reader.bit();
        let size = model.decode(reader, rawBits);
        if (state === SIGNIFICANT) size++;
        const magnitude = size * quality + Math.trunc(quality / 2);
        if (reader.failed) continue;
        addDetail(plane, negative ? -magnitude : magnitude, whole.rowEnd, whole.colEnd, whole.rowStart, whole.colStart, band, row, col);
      }
    }
  }
}

/**
 * Rebuilds the picture from the coarsest level down: double it, then add that level's detail. Before the last
 * doubling the picture is sharpened, as the codec does when sharpening is on.
 */
export function reconstruct(
  reader: BitReader,
  coarsest: CoefficientPlane,
  map: SignificanceMap,
  rows: number,
  cols: number,
  levels: number,
  firstDetailLevel: number,
  quality: number,
): CoefficientPlane {
  let plane = coarsest;
  for (let level = levels - 1; level >= 0; level--) {
    if (level === 0) {
      const sharpened = new CoefficientPlane(rows, cols);
      sharpen(plane, sharpened, Math.trunc(rows / 2) + 1, Math.trunc(cols / 2) + 1);
      plane = sharpened;
    }
    upsample(plane, rows, cols, level);
    if (!reader.failed && level >= firstDetailLevel) decodeDetails(reader, plane, map, rows, cols, level, quality);
  }
  return plane;
}
