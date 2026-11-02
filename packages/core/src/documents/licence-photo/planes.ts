export class PhotoOutOfBounds extends Error {}

/**
 * A grid of coefficients laid out exactly as the codec allocates it: one spare row and column before the first,
 * so index -1 is valid and holds 0, and a cell past the end of a row is the next row's spare column. The decoder
 * relies on that layout, so reads and writes outside it are errors rather than silent zeros.
 */
export class CoefficientPlane {
  readonly data: Int32Array;
  private readonly stride: number;

  constructor(rows: number, cols: number) {
    this.stride = cols + 1;
    this.data = new Int32Array((rows + 1) * this.stride);
  }

  private index(row: number, col: number): number {
    const index = (row + 1) * this.stride + 1 + col;
    if (index < 0 || index >= this.data.length) throw new PhotoOutOfBounds(`Cell ${row},${col} is outside the plane`);
    return index;
  }

  get(row: number, col: number): number {
    return this.data[this.index(row, col)] ?? 0;
  }

  set(row: number, col: number, value: number): void {
    this.data[this.index(row, col)] = value;
  }

  add(row: number, col: number, delta: number): void {
    const index = this.index(row, col);
    this.data[index] = (this.data[index] ?? 0) + delta;
  }
}

/** One byte per coefficient: 1 not yet significant, 2 became significant, 4 has significant children. */
export const UNKNOWN = 1;
export const SIGNIFICANT = 2;
export const PARENT_OF_SIGNIFICANT = 4;

export class SignificanceMap {
  private readonly data: Uint8Array;

  constructor(
    rows: number,
    private readonly cols: number,
  ) {
    this.data = new Uint8Array(rows * cols).fill(UNKNOWN);
  }

  private index(row: number, col: number): number {
    const index = row * this.cols + col;
    if (row < 0 || col < 0 || index >= this.data.length) throw new PhotoOutOfBounds(`Cell ${row},${col} is outside the map`);
    return index;
  }

  get(row: number, col: number): number {
    return this.data[this.index(row, col)] ?? 0;
  }

  set(row: number, col: number, value: number): void {
    this.data[this.index(row, col)] = value;
  }
}
