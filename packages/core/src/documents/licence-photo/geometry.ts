/** Rows or columns at a wavelet level: each level halves the one above it, keeping its edge samples. */
export function levelSize(size: number, level: number): number {
  return (size + (1 << (level + 1)) - 2) >> level;
}

function floorLog2(value: number): number {
  if (value <= 0) return -1;
  let result = 0;
  for (let remaining = value; remaining > 1; remaining = Math.trunc(remaining / 2)) result++;
  return result;
}

/** How many wavelet levels the codec uses for a picture of this size. */
export function levelCount(rows: number, cols: number): number {
  return Math.max(0, floorLog2(Math.min(rows, cols) - 2) - 2);
}

export type Rect = { rowStart: number; rowEnd: number; colStart: number; colEnd: number };

/**
 * Where a detail band sits at a level. Band 0 is top right, band 1 bottom left, band 2 bottom right; the
 * coarser picture fills the top left quarter.
 */
export function bandRect(rows: number, cols: number, level: number, band: 0 | 1 | 2): Rect {
  const levelRows = levelSize(rows, level);
  const levelCols = levelSize(cols, level);
  const halfRows = Math.trunc((levelRows + 2) / 2);
  const halfCols = Math.trunc((levelCols + 2) / 2);
  if (band === 0) return { rowStart: 0, rowEnd: halfRows, colStart: halfCols, colEnd: levelCols };
  if (band === 1) return { rowStart: halfRows, rowEnd: levelRows, colStart: 0, colEnd: halfCols };
  return { rowStart: halfRows, rowEnd: levelRows, colStart: halfCols, colEnd: levelCols };
}

export const BANDS = [0, 1, 2] as const;
