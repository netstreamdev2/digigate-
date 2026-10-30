import { AdaptiveHuffman } from './adaptive-huffman';
import type { BitReader } from './bit-reader';
import { bandRect, type Rect } from './geometry';
import { PARENT_OF_SIGNIFICANT, SIGNIFICANT, UNKNOWN, type SignificanceMap } from './planes';

/** Quadrant scan orders. Each one fixes which corner the walk starts from and which way the snake runs. */
type Order = 0 | 1 | 2 | 3;

type Pass = {
  reader: BitReader;
  map: SignificanceMap;
  model: AdaptiveHuffman;
  /** Unknown cells still to skip before the next significant one. */
  run: number;
  level: number;
  levels: number;
  band: 0 | 1 | 2;
  bandRowEnd: number;
  bandColEnd: number;
  /** Per band and level, how a child's row or column maps to its parent's, from the band's size parity. */
  rowParity: number[][];
  colParity: number[][];
};

function parityTables(rows: number, cols: number, levels: number): { rowParity: number[][]; colParity: number[][] } {
  const rowParity = [0, 1, 2].map(() => new Array<number>(levels + 1).fill(0));
  const colParity = [0, 1, 2].map(() => new Array<number>(levels + 1).fill(0));
  const put = (table: number[][], band: number, level: number, value: number) => {
    const row = table[band];
    if (row) row[level] = value;
  };
  for (let level = 0; level < levels; level++) {
    const top = bandRect(rows, cols, level, 0);
    put(rowParity, 0, level, (top.rowEnd & 1) + 4);
    put(colParity, 0, level, top.colEnd & 3);
    put(colParity, 2, level, top.colEnd & 3);
    const left = bandRect(rows, cols, level, 1);
    put(rowParity, 1, level, left.rowEnd & 3);
    put(rowParity, 2, level, left.rowEnd & 3);
    put(colParity, 1, level, (left.colEnd & 1) + 4);
  }
  return { rowParity, colParity };
}

/** A child's index in the parent level: parities 0 and 1 round up, 2 adds one more, 3 too unless at the end. */
function parentIndex(index: number, parity: number, end: number): number {
  let shifted = index;
  if (parity === 3 && shifted === end - 1) shifted--;
  if (parity === 3 || parity === 2) shifted++;
  if (parity >= 0 && parity <= 3) shifted++;
  return Math.trunc(shifted / 2);
}

/** Marks the parents of a newly significant cell, level by level, until one is already marked. */
function markParents(pass: Pass, row: number, col: number): void {
  let parentRow = row;
  let parentCol = col;
  let rowEnd = pass.bandRowEnd;
  let colEnd = pass.bandColEnd;
  for (let level = pass.level + 1; level < pass.levels; level++) {
    parentRow = parentIndex(parentRow, pass.rowParity[pass.band]?.[level - 1] ?? 0, rowEnd);
    parentCol = parentIndex(parentCol, pass.colParity[pass.band]?.[level - 1] ?? 0, colEnd);
    if (pass.map.get(parentRow, parentCol) === PARENT_OF_SIGNIFICANT) break;
    rowEnd = Math.trunc(rowEnd / 2) + 1;
    colEnd = Math.trunc(colEnd / 2) + 1;
    pass.map.set(parentRow, parentCol, PARENT_OF_SIGNIFICANT);
  }
  pass.run = pass.model.decodeNumber(pass.reader);
}

function visit(pass: Pass, row: number, col: number): void {
  if (pass.map.get(row, col) !== UNKNOWN) return;
  if (pass.run === 0) {
    pass.map.set(row, col, SIGNIFICANT);
    markParents(pass, row, col);
  } else {
    pass.run--;
  }
}

function countUnknown(map: SignificanceMap, rect: Rect): number {
  let count = 0;
  for (let row = rect.rowStart; row < rect.rowEnd; row++) {
    for (let col = rect.colStart; col < rect.colEnd; col++) if (map.get(row, col) === UNKNOWN) count++;
  }
  return count;
}

function forEachIndex(start: number, end: number, ascending: boolean, visitIndex: (index: number) => void): void {
  if (ascending) for (let index = start; index < end; index++) visitIndex(index);
  else for (let index = end - 1; index >= start; index--) visitIndex(index);
}

/** Visits every cell of a small region in a snake, as the order dictates. */
function snake(pass: Pass, order: Order, rect: Rect): void {
  let forward = order === 0 || order === 2;
  const byColumn = order === 0 || order === 1;
  const outerAscending = order === 1 || order === 3;
  const [outerStart, outerEnd, innerStart, innerEnd] = byColumn
    ? [rect.colStart, rect.colEnd, rect.rowStart, rect.rowEnd]
    : [rect.rowStart, rect.rowEnd, rect.colStart, rect.colEnd];
  forEachIndex(outerStart, outerEnd, outerAscending, (outer) => {
    forEachIndex(innerStart, innerEnd, forward, (inner) => (byColumn ? visit(pass, inner, outer) : visit(pass, outer, inner)));
    forward = !forward;
  });
}

/**
 * Finds the significant cells in a region. While the run of unknown cells to skip is shorter than the number
 * of unknown cells here, something in the region is significant: big regions split into quadrants (three
 * recursively, the fourth in this loop), small ones are scanned cell by cell. Otherwise the whole region is skipped.
 */
function walk(pass: Pass, order: Order, region: Rect): void {
  let current = order;
  let rect = region;
  let unknown = countUnknown(pass.map, rect);
  while (pass.run < unknown) {
    const height = rect.rowEnd - rect.rowStart;
    const width = rect.colEnd - rect.colStart;
    if (!(width > 2 && height > 2)) {
      snake(pass, current, rect);
      return;
    }
    const midRow = Math.trunc(height / 2) + rect.rowStart;
    const midCol = Math.trunc(width / 2) + rect.colStart;
    const topRight = { rowStart: rect.rowStart, rowEnd: midRow, colStart: midCol, colEnd: rect.colEnd };
    const topLeft = { rowStart: rect.rowStart, rowEnd: midRow, colStart: rect.colStart, colEnd: midCol };
    const bottomRight = { rowStart: midRow, rowEnd: rect.rowEnd, colStart: midCol, colEnd: rect.colEnd };
    const bottomLeft = { rowStart: midRow, rowEnd: rect.rowEnd, colStart: rect.colStart, colEnd: midCol };
    if (current === 0) {
      walk(pass, 3, topRight);
      walk(pass, 0, bottomRight);
      walk(pass, 0, bottomLeft);
      [rect, current] = [topLeft, 2];
    } else if (current === 1) {
      walk(pass, 2, bottomLeft);
      walk(pass, 1, topLeft);
      walk(pass, 1, topRight);
      [rect, current] = [bottomRight, 3];
    } else if (current === 2) {
      walk(pass, 1, bottomLeft);
      walk(pass, 2, bottomRight);
      walk(pass, 2, topRight);
      [rect, current] = [topLeft, 0];
    } else {
      walk(pass, 0, topRight);
      walk(pass, 3, topLeft);
      walk(pass, 3, bottomLeft);
      [rect, current] = [bottomRight, 1];
    }
    unknown = countUnknown(pass.map, rect);
  }
  pass.run -= unknown;
}

const EVEN_LEVEL: readonly (readonly [0 | 1 | 2, Order])[] = [
  [0, 3],
  [2, 0],
  [1, 0],
];
const ODD_LEVEL: readonly (readonly [0 | 1 | 2, Order])[] = [
  [1, 1],
  [2, 2],
  [0, 2],
];

/**
 * Decodes which detail coefficients carry a value, from the finest level to the coarsest, as runs of cells to
 * skip. A run left over at the end means the stream is damaged.
 */
export function decodeSignificance(reader: BitReader, map: SignificanceMap, rows: number, cols: number, levels: number): void {
  const model = new AdaptiveHuffman(0x100, 64);
  const pass: Pass = {
    reader,
    map,
    model,
    run: model.decodeNumber(reader),
    level: 0,
    levels,
    band: 0,
    bandRowEnd: 0,
    bandColEnd: 0,
    ...parityTables(rows, cols, levels),
  };
  let even = true;
  for (let level = 0; level < levels; level++) {
    pass.level = level;
    if (reader.failed) continue;
    for (const [band, order] of even ? EVEN_LEVEL : ODD_LEVEL) {
      const rect = bandRect(rows, cols, level, band);
      pass.band = band;
      pass.bandRowEnd = rect.rowEnd;
      pass.bandColEnd = rect.colEnd;
      walk(pass, order, rect);
    }
    even = !even;
  }
  if (pass.run !== 0) reader.failed = true;
}
