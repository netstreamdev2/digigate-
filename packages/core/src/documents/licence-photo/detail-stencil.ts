import type { CoefficientPlane } from './planes';

/**
 * Adds one detail coefficient to the picture at its level. Each band spreads its value with a fixed separable
 * pattern ([-1, -2, 6, -2, -1] across the band's direction, [1, 2, 1] along it), and every edge and corner has its
 * own clipped pattern. This is a statement-for-statement translation of the codec's routine, checked byte for byte
 * against the reference decoder.
 *
 * `rows` and `cols` are the level's size, `halfRows` and `halfCols` where its detail bands start, and `row`, `col`
 * the coefficient's position in the band.
 */
export function addDetail(
  plane: CoefficientPlane,
  value: number,
  rows: number,
  cols: number,
  halfRows: number,
  halfCols: number,
  band: number,
  row: number,
  col: number,
): void {
  if (!band) {
    if (!row) {
      if (col === halfCols) {
        const b = value * 4;
        const a = value * 8;
        plane.add(0, 0, -(a));
        plane.add(0, 1, a * 3);
        plane.add(0, 2, -(a));
        plane.add(0, 3, -(b));
        plane.add(1, 0, -(b));
        plane.add(1, 1, (a + b));
        plane.add(1, 2, -(b));
        plane.add(1, 3, -(Math.trunc(b / 2)));
        return;
      }
      if (col === (cols - 1)) {
        const b = value * 4;
        const a = value * 8;
        const c = a + b;
        const j = ((col - halfCols) * 2 - 1);
        plane.add(0, j + 0, -(b));
        plane.add(0, j + 1, -(a));
        plane.add(0, j + 2, c * 2);
        plane.add(0, j + 3, -(a));
        plane.add(1, j + 0, -(Math.trunc(b / 2)));
        plane.add(1, j + 1, -(b));
        plane.add(1, j + 2, c);
        plane.add(1, j + 3, -(b));
        return;
      }
      const d = value * 2;
      const j = (col - halfCols) * 2 - 1;
      const b = 4 * value;
      const a = b * 2;
      const c = a + b;
      plane.add(0, j + 0, -(b));
      plane.add(0, j + 1, -(a));
      plane.add(0, j + 2, c * 2);
      plane.add(0, j + 3, -(a));
      plane.add(0, j + 4, -(b));
      plane.add(1, j + 0, -(Math.trunc(b / 2)));
      plane.add(1, j + 1, -(b));
      plane.add(1, j + 2, c);
      plane.add(1, j + 3, -(b));
      plane.add(1, j + 4, -(Math.trunc(b / 2)));
      return;
    }
    if (row === Math.trunc((rows - 1) / 2)) {
      if (col === halfCols) {
        const b = value * 4;
        const a = b * 2;
        const c = a + b;
        plane.add(row * 2 - 1, 0, -(b));
        plane.add(row * 2 - 1, 1, c);
        plane.add(row * 2 - 1, 2, -(b));
        plane.add(row * 2 - 1, 3, -(Math.trunc(b / 2)));
        plane.add(row * 2, 0, -(a));
        plane.add(row * 2, 1, a * 3);
        plane.add(row * 2, 2, -(a));
        plane.add(row * 2, 3, -(b));
        return;
      }
      if (col === (cols - 1))
      {
        const iecx = (col - halfCols) * 2 - 1;
        const b = value * 4;
        const a = b * 2;
        const c = a + b;
        plane.add(row * 2 - 1, iecx + 0, -(Math.trunc(b / 2)));
        plane.add(row * 2 - 1, iecx + 1, -(b));
        plane.add(row * 2 - 1, iecx + 2, c);
        plane.add(row * 2 - 1, iecx + 3, -(b));
        plane.add(row * 2, iecx + 0, -(b));
        plane.add(row * 2, iecx + 1, -(a));
        plane.add(row * 2, iecx + 2, a * 3);
        plane.add(row * 2, iecx + 3, -(a));
        return;
      }
      const iecx = (col - halfCols) * 2 - 1;
      const b = value * 4;
      const a = b * 2;
      const c = a + b;
      plane.add(row * 2 - 1, iecx + 0, -(Math.trunc(b / 2)));
      plane.add(row * 2 - 1, iecx + 1, -(b));
      plane.add(row * 2 - 1, iecx + 2, c);
      plane.add(row * 2 - 1, iecx + 3, -(b));
      plane.add(row * 2 - 1, iecx + 4, -(Math.trunc(b / 2)));
      plane.add(row * 2, iecx + 0, -(b));
      plane.add(row * 2, iecx + 1, -(a));
      plane.add(row * 2, iecx + 2, c * 2);
      plane.add(row * 2, iecx + 3, -(a));
      plane.add(row * 2, iecx + 4, -(b));
      return;
    }
    if (row === (halfRows - 1))
    {
      if (col === halfCols)
      {
        const b = value * 4;
        const a = b * 2;
        const c = a + b;
        plane.add(rows - 1, 0, -(a));
        plane.add(rows - 1, 1, c * 2);
        plane.add(rows - 1, 2, -(a));
        plane.add(rows - 1, 3, -(b));
        return;
      }
      const b = value * 4;
      const a = b * 2;
      if (col === (cols - 1)) {
        const c = a + b;
        const ieax = (col - halfCols) * 2 - 1;
        plane.add(rows - 1, ieax + 0, -(b));
        plane.add(rows - 1, ieax + 1, -(a));
        plane.add(rows - 1, ieax + 2, c * 2);
        plane.add(rows - 1, ieax + 3, -(a));
        return;
      }
      const ieax = (col - halfCols) * 2 - 1;
      const c = (a + b);
      plane.add(rows - 1, ieax + 0, -(b));
      plane.add(rows - 1, ieax + 1, -(a));
      plane.add(rows - 1, ieax + 2, c * 2);
      plane.add(rows - 1, ieax + 3, -(a));
      plane.add(rows - 1, ieax + 4, -(b));
      return;
    }
    if (col === halfCols)
    {
      const iedi = value * 2;
      const b = iedi * 2;
      const a = b * 2;
      const c = a + b;
      plane.add(row * 2 - 1, 0, -(b));
      plane.add(row * 2 - 1, 1, c);
      plane.add(row * 2 - 1, 2, -(b));
      plane.add(row * 2 - 1, 3, -(Math.trunc(b / 2)));
      plane.add(row * 2, 0, -(a));
      plane.add(row * 2, 1, (a * 3));
      plane.add(row * 2, 2, -(a));
      plane.add(row * 2, 3, -(b));
      plane.add(row * 2 + 1, 0, -(b));
      plane.add(row * 2 + 1, 1, c);
      plane.add(row * 2 + 1, 2, -(b));
      plane.add(row * 2 + 1, 3, -(Math.trunc(b / 2)));
      return;
    }
    if (col === (cols - 1))
    {
      const iecx = (col - halfCols) * 2 - 1;
      const iedi = value * 2;
      const b = iedi * 2;
      const a = b * 2;
      const c = a + b;
      plane.add(row * 2 - 1, iecx + 0, -(Math.trunc(b / 2)));
      plane.add(row * 2 - 1, iecx + 1, -(b));
      plane.add(row * 2 - 1, iecx + 2, c);
      plane.add(row * 2 - 1, iecx + 3, -(b));
      plane.add(row * 2, iecx + 0, -(b));
      plane.add(row * 2, iecx + 1, -(a));
      plane.add(row * 2, iecx + 2, (a * 3));
      plane.add(row * 2, iecx + 3, -(a));
      plane.add(row * 2 + 1, iecx + 0, -(Math.trunc(b / 2)));
      plane.add(row * 2 + 1, iecx + 1, -(b));
      plane.add(row * 2 + 1, iecx + 2, c);
      plane.add(row * 2 + 1, iecx + 3, -(b));
      return;
    }
    const iecx = (col - halfCols) * 2 - 1;
    const iesi = value * 2;
    const b = iesi * 2;
    plane.add(row * 2 - 1, iecx + 0, -(Math.trunc(b / 2)));
    plane.add(row * 2 - 1, iecx + 1, -(b));
    const a = b * 2;
    plane.add(row * 2 - 1, iecx + 2, (a + b));
    plane.add(row * 2 - 1, iecx + 3, -(b));
    plane.add(row * 2 - 1, iecx + 4, -(Math.trunc(b / 2)));
    plane.add(row * 2, iecx + 0, -(b));
    plane.add(row * 2, iecx + 1, -(a));
    plane.add(row * 2, iecx + 2, (a + b) * 2);
    plane.add(row * 2, iecx + 3, -(a));
    plane.add(row * 2, iecx + 4, -(b));
    plane.add(row * 2 + 1, iecx + 0, -(Math.trunc(b / 2)));
    plane.add(row * 2 + 1, iecx + 1, -(b));
    plane.add(row * 2 + 1, iecx + 2, (a + b));
    plane.add(row * 2 + 1, iecx + 3, -(b));
    plane.add(row * 2 + 1, iecx + 4, -(Math.trunc(b / 2)));
    return;
  }
  if (band === 1) {
    if (row === halfRows) {
      if (!col) {
        const b = value * 4;
        const a = value * 8;
        plane.add(0, 0, -(a));
        plane.add(0, 1, -(b));
        plane.add(1, 0, (a + b) * 2);
        plane.add(1, 1, (a + b));
        plane.add(2, 0, -(a));
        plane.add(2, 1, -(b));
        plane.add(3, 0, -(b));
        plane.add(3, 1, -(Math.trunc(b / 2)));
        return;
      }
      if (col === Math.trunc((cols - 1) / 2)) {
        const iecx = col * 2 - 1;
        const b = value * 4;
        const a = b * 2;
        plane.add(0, iecx + 0, -(b));
        plane.add(0, iecx + 1, -(a));
        plane.add(1, iecx + 0, (a + b));
        plane.add(1, iecx + 1, (a + b) * 2);
        plane.add(2, iecx + 0, -(b));
        plane.add(2, iecx + 1, -(a));
        plane.add(3, iecx + 0, -(Math.trunc(b / 2)));
        plane.add(3, iecx + 1, -(b));
        return;
      }
      if (col === (halfCols - 1)) {
        const b = value * 4;
        const a = b * 2;
        plane.add(0, cols - 1, -(a));
        plane.add(1, cols - 1, (a + b) * 2);
        plane.add(2, cols - 1, -(a));
        plane.add(3, cols - 1, -(b));
        return;
      }
      const ieax = col * 2 - 1;
      const b = value * 4;
      const a = b * 2;
      plane.add(0, ieax + 0, -(b));
      plane.add(0, ieax + 1, -(a));
      plane.add(0, ieax + 2, -(b));
      const c = a + b;
      plane.add(1, ieax + 0, c);
      plane.add(1, ieax + 1, c * 2);
      plane.add(1, ieax + 2, c);
      plane.add(2, ieax + 0, -(b));
      plane.add(2, ieax + 1, -(a));
      plane.add(2, ieax + 2, -(b));
      plane.add(3, ieax + 0, -(Math.trunc(b / 2)));
      plane.add(3, ieax + 1, -(b));
      plane.add(3, ieax + 2, -(Math.trunc(b / 2)));
      return;
    }
    if (row === (rows - 1))
    {
      if (!col)
      {
        const b = value * 4;
        const a = b * 2;
        const ieax = (row - halfRows) * 2;
        const iebx = value * 2;
        plane.add(ieax - 1, 0, -(b));
        plane.add(ieax - 1, 1, -(Math.trunc(b / 2)));
        plane.add(ieax, 0, -(a));
        plane.add(ieax, 1, -(b));
        plane.add(ieax + 1, 0, (a + b) * 2);
        plane.add(ieax + 1, 1, (a + b));
        plane.add(ieax + 2, 0, -(a));
        plane.add(ieax + 2, 1, -(b));
        return;
      }
      if (col === Math.trunc((cols - 1) / 2))
      {
        const ieax = (row - halfRows) * 2;
        const iecx = col * 2 - 1;
        const b = value * 4;
        const a = b * 2;
        const c = a + b;
        plane.add(ieax - 1, iecx + 0, -(Math.trunc(b / 2)));
        plane.add(ieax - 1, iecx + 1, -(b));
        plane.add(ieax, iecx + 0, -(b));
        plane.add(ieax, iecx + 1, -(a));
        plane.add(ieax + 1, iecx + 0, c);
        plane.add(ieax + 1, iecx + 1, c * 2);
        plane.add(ieax + 2, iecx + 0, -(b));
        plane.add(ieax + 2, iecx + 1, -(a));
        return;
      }
      if (col === (halfCols - 1)) {
        const ieax = (row - halfRows) * 2;
        const iecx = cols - 1;
        const b = value * 4;
        const a = b * 2;
        const c = a + b;
        plane.add(ieax - 1, iecx + 0, -(b));
        plane.add(ieax, iecx + 0, -(a));
        plane.add(ieax + 1, iecx + 0, c * 2);
        plane.add(ieax + 2, iecx + 0, -(a));
        return;
      }
      const ieax = (row - halfRows) * 2;
      const iecx = col * 2 - 1;
      const iedi = value * 2;
      const b = iedi * 2;
      plane.add(ieax - 1, iecx + 0, -(Math.trunc(b / 2)));
      plane.add(ieax - 1, iecx + 1, -(b));
      plane.add(ieax - 1, iecx + 2, -(Math.trunc(b / 2)));
      const a = b * 2;
      plane.add(ieax, iecx + 0, -(b));
      plane.add(ieax, iecx + 1, -(a));
      plane.add(ieax, iecx + 2, -(b));
      const c = a + b;
      plane.add(ieax + 1, iecx + 0, c);
      plane.add(ieax + 1, iecx + 1, c * 2);
      plane.add(ieax + 1, iecx + 2, c);
      plane.add(ieax + 2, iecx + 0, -(b));
      plane.add(ieax + 2, iecx + 1, -(a));
      plane.add(ieax + 2, iecx + 2, -(b));
      return;
    }
    if (!col) {
      const b = value * 4;
      const a = b * 2;
      const c = a + b;
      const ieax = (row - halfRows) * 2;
      plane.add(ieax - 1, 0, -(b));
      plane.add(ieax - 1, 1, -(Math.trunc(b / 2)));
      plane.add(ieax, 0, -(a));
      plane.add(ieax, 1, -(b));
      plane.add(ieax + 1, 0, c * 2);
      plane.add(ieax + 1, 1, c);
      plane.add(ieax + 2, 0, -(a));
      plane.add(ieax + 2, 1, -(b));
      plane.add(ieax + 3, 0, -(b));
      plane.add(ieax + 3, 1, -(Math.trunc(b / 2)));
      return;
    }
    if (col === Math.trunc((cols - 1) / 2))
    {
      const ieax = (row - halfRows) * 2;
      const iecx = col * 2 - 1;
      const iebx = value * 2;
      const b = iebx * 2;
      const a = b * 2;
      const c = a + b;
      plane.add(ieax - 1, iecx + 0, -(Math.trunc(b / 2)));
      plane.add(ieax - 1, iecx + 1, -(b));
      plane.add(ieax, iecx + 0, -(b));
      plane.add(ieax, iecx + 1, -(a));
      plane.add(ieax + 1, iecx + 0, c);
      plane.add(ieax + 1, iecx + 1, c * 2);
      plane.add(ieax + 2, iecx + 0, -(b));
      plane.add(ieax + 2, iecx + 1, -(a));
      plane.add(ieax + 3, iecx + 0, -(Math.trunc(b / 2)));
      plane.add(ieax + 3, iecx + 1, -(b));
      return;
    }
    if (col === (halfCols - 1)) {
      const ieax = (row - halfRows) * 2;
      const iecx = (cols - 1);
      const b = value * 4;
      const a = b * 2;
      const c = a + b;
      plane.add(ieax - 1, iecx + 0, -(b));
      plane.add(ieax, iecx + 0, -(a));
      plane.add(ieax + 1, iecx + 0, c * 2);
      plane.add(ieax + 2, iecx + 0, -(a));
      plane.add(ieax + 3, iecx + 0, -(b));
      return;
    }
    const ieax = (row - halfRows) * 2;
    const iesi = value * 2;
    const b = iesi * 2;
    const a = b * 2;
    const c = a + b;
    const iedx = col * 2 - 1;
    plane.add(ieax - 1, iedx + 0, -(Math.trunc(b / 2)));
    plane.add(ieax - 1, iedx + 1, -(b));
    plane.add(ieax - 1, iedx + 2, -(Math.trunc(b / 2)));
    plane.add(ieax, iedx + 0, -(b));
    plane.add(ieax, iedx + 1, -(a));
    plane.add(ieax, iedx + 2, -(b));
    plane.add(ieax + 1, iedx + 0, c);
    plane.add(ieax + 1, iedx + 1, c * 2);
    plane.add(ieax + 1, iedx + 2, c);
    plane.add(ieax + 2, iedx + 0, -(b));
    plane.add(ieax + 2, iedx + 1, -(a));
    plane.add(ieax + 2, iedx + 2, -(b));
    plane.add(ieax + 3, iedx + 0, -(Math.trunc(b / 2)));
    plane.add(ieax + 3, iedx + 1, -(b));
    plane.add(ieax + 3, iedx + 2, -(Math.trunc(b / 2)));
    return;
  }
  if (row === halfRows) {
    if (col === halfCols) {
      const b = value * 2;
      const a = b * 2;
      const c = a + b;
      const d = c * 2;
      plane.add(0, 0, a);
      plane.add(0, 1, -(d));
      plane.add(0, 2, a);
      plane.add(0, 3, b);
      plane.add(1, 0, -(d));
      plane.add(1, 1, d * 3);
      plane.add(1, 2, -(d));
      plane.add(1, 3, -(c));
      plane.add(2, 0, a);
      plane.add(2, 1, -(d));
      plane.add(2, 2, a);
      plane.add(2, 3, b);
      plane.add(3, 0, b);
      plane.add(3, 1, -(c));
      plane.add(3, 2, b);
      plane.add(3, 3, Math.trunc(b / 2));
      return;
    }
    if (col === (cols - 1)) {
      const j = (col - halfCols) * 2 - 1;
      const b = value * 2;
      const a = b * 2;
      const c = a + b;
      const d = c * 2;
      plane.add(0, j + 0, b);
      plane.add(0, j + 1, a);
      plane.add(0, j + 2, -(d));
      plane.add(0, j + 3, a);
      plane.add(1, j + 0, -(c));
      plane.add(1, j + 1, -(d));
      plane.add(1, j + 2, d * 3);
      plane.add(1, j + 3, -(d));
      plane.add(2, j + 0, b);
      plane.add(2, j + 1, a);
      plane.add(2, j + 2, -(d));
      plane.add(2, j + 3, a);
      plane.add(3, j + 0, Math.trunc(b / 2));
      plane.add(3, j + 1, b);
      plane.add(3, j + 2, -(c));
      plane.add(3, j + 3, b);
      return;
    }
    const ieax = (col - halfCols) * 2 - 1;
    const b = value * 2;
    const a = b * 2;
    const c = a + b;
    const d = c * 2;
    plane.add(0, ieax + 0, b);
    plane.add(0, ieax + 1, a);
    plane.add(0, ieax + 2, -(d));
    plane.add(0, ieax + 3, a);
    plane.add(0, ieax + 4, b);
    plane.add(1, ieax + 0, -(c));
    plane.add(1, ieax + 1, -(d));
    plane.add(1, ieax + 2, d * 3);
    plane.add(1, ieax + 3, -(d));
    plane.add(1, ieax + 4, -(c));
    plane.add(2, ieax + 0, b);
    plane.add(2, ieax + 1, a);
    plane.add(2, ieax + 2, -(d));
    plane.add(2, ieax + 3, a);
    plane.add(2, ieax + 4, b);
    plane.add(3, ieax + 0, Math.trunc(b / 2));
    plane.add(3, ieax + 1, b);
    plane.add(3, ieax + 2, -(c));
    plane.add(3, ieax + 3, b);
    plane.add(3, ieax + 4, Math.trunc(b / 2));
    return;
  }
  if (row === (rows - 1)) {
    if (col === halfCols)
    {
      const iecx = (row - halfRows) * 2;
      const b = value * 2;
      const a = b * 2;
      const c = a + b;
      const d = c * 2;
      plane.add(iecx - 1, 0, b);
      plane.add(iecx - 1, 1, -(c));
      plane.add(iecx - 1, 2, b);
      plane.add(iecx - 1, 3, Math.trunc(b / 2));
      plane.add(iecx, 0, a);
      plane.add(iecx, 1, -(d));
      plane.add(iecx, 2, a);
      plane.add(iecx, 3, b);
      plane.add(iecx + 1, 0, -(d));
      plane.add(iecx + 1, 1, d * 3);
      plane.add(iecx + 1, 2, -(d));
      plane.add(iecx + 1, 3, -(c));
      plane.add(iecx + 2, 0, a);
      plane.add(iecx + 2, 1, -(d));
      plane.add(iecx + 2, 2, a);
      plane.add(iecx + 2, 3, b);
      return;
    }
    if (col === (cols - 1))
    {
      const ieax = (row - halfRows) * 2;
      const iecx = (col - halfCols) * 2 - 1;
      const b = value * 2;
      const a = b * 2;
      const d = (a + b) * 2;
      const c = (a + b);
      plane.add(ieax - 1, iecx + 0, Math.trunc(b / 2));
      plane.add(ieax - 1, iecx + 1, b);
      plane.add(ieax - 1, iecx + 2, -(c));
      plane.add(ieax - 1, iecx + 3, b);
      plane.add(ieax, iecx + 0, b);
      plane.add(ieax, iecx + 1, a);
      plane.add(ieax, iecx + 2, -(d));
      plane.add(ieax, iecx + 3, a);
      plane.add(ieax + 1, iecx + 0, -(c));
      plane.add(ieax + 1, iecx + 1, -(d));
      plane.add(ieax + 1, iecx + 2, d * 3);
      plane.add(ieax + 1, iecx + 3, -(d));
      plane.add(ieax + 2, iecx + 0, b);
      plane.add(ieax + 2, iecx + 1, a);
      plane.add(ieax + 2, iecx + 2, -(d));
      plane.add(ieax + 2, iecx + 3, a);
      return;
    }
    const ieax = (row - halfRows) * 2;
    const iecx = (col - halfCols) * 2 - 1;
    const b = value * 2;
    const a = b * 2;
    const c = a + b;
    const d = c * 2;
    plane.add(ieax - 1, iecx + 0, Math.trunc(b / 2));
    plane.add(ieax - 1, iecx + 1, b);
    plane.add(ieax - 1, iecx + 2, -(c));
    plane.add(ieax - 1, iecx + 3, b);
    plane.add(ieax - 1, iecx + 4, Math.trunc(b / 2));
    plane.add(ieax, iecx + 0, b);
    plane.add(ieax, iecx + 1, a);
    plane.add(ieax, iecx + 2, -(d));
    plane.add(ieax, iecx + 3, a);
    plane.add(ieax, iecx + 4, b);
    plane.add(ieax + 1, iecx + 0, -(c));
    plane.add(ieax + 1, iecx + 1, -(d));
    plane.add(ieax + 1, iecx + 2, d * 3);
    plane.add(ieax + 1, iecx + 3, -(d));
    plane.add(ieax + 1, iecx + 4, -(c));
    plane.add(ieax + 2, iecx + 0, b);
    plane.add(ieax + 2, iecx + 1, a);
    plane.add(ieax + 2, iecx + 2, -(d));
    plane.add(ieax + 2, iecx + 3, a);
    plane.add(ieax + 2, iecx + 4, b);
    return;
  }
  if (col === halfCols) {
    const ieax = (row - halfRows) * 2;
    const b = value * 2;
    const a = b * 2;
    const c = a + b;
    const d = c * 2;
    plane.add(ieax - 1, 0, b);
    plane.add(ieax - 1, 1, -(c));
    plane.add(ieax - 1, 2, b);
    plane.add(ieax - 1, 3, Math.trunc(b / 2));
    plane.add(ieax, 0, a);
    plane.add(ieax, 1, -(d));
    plane.add(ieax, 2, a);
    plane.add(ieax, 3, b);
    plane.add(ieax + 1, 0, -(d));
    plane.add(ieax + 1, 1, d * 3);
    plane.add(ieax + 1, 2, -(d));
    plane.add(ieax + 1, 3, -(c));
    plane.add(ieax + 2, 0, a);
    plane.add(ieax + 2, 1, -(d));
    plane.add(ieax + 2, 2, a);
    plane.add(ieax + 2, 3, b);
    plane.add(ieax + 3, 0, b);
    plane.add(ieax + 3, 1, -(c));
    plane.add(ieax + 3, 2, b);
    plane.add(ieax + 3, 3, Math.trunc(b / 2));
    return;
  }
  if (col === (cols - 1))
  {
    const ieax = (row - halfRows) * 2;
    const iecx = (col - halfCols) * 2 - 1;
    const b = value * 2;
    const a = b * 2;
    const c = (a + b);
    const d = c * 2;
    plane.add(ieax - 1, iecx + 0, Math.trunc(b / 2));
    plane.add(ieax - 1, iecx + 1, b);
    plane.add(ieax - 1, iecx + 2, -(c));
    plane.add(ieax - 1, iecx + 3, b);
    plane.add(ieax, iecx + 0, b);
    plane.add(ieax, iecx + 1, a);
    plane.add(ieax, iecx + 2, -(d));
    plane.add(ieax, iecx + 3, a);
    plane.add(ieax + 1, iecx + 0, -(c));
    plane.add(ieax + 1, iecx + 1, -(d));
    plane.add(ieax + 1, iecx + 2, d * 3);
    plane.add(ieax + 1, iecx + 3, -(d));
    plane.add(ieax + 2, iecx + 0, b);
    plane.add(ieax + 2, iecx + 1, a);
    plane.add(ieax + 2, iecx + 2, -(d));
    plane.add(ieax + 2, iecx + 3, a);
    plane.add(ieax + 3, iecx + 0, Math.trunc(b / 2));
    plane.add(ieax + 3, iecx + 1, b);
    plane.add(ieax + 3, iecx + 2, -(c));
    plane.add(ieax + 3, iecx + 3, b);
    return;
  }
  const ieax = (row - halfRows) * 2;
  const iecx = (col - halfCols) * 2 - 1;
  const b = value * 2;
  const a = b * 2;
  const c = a + b;
  const d = c * 2;
  plane.add(ieax - 1, iecx + 0, Math.trunc(b / 2));
  plane.add(ieax - 1, iecx + 1, b);
  plane.add(ieax - 1, iecx + 2, -(c));
  plane.add(ieax - 1, iecx + 3, b);
  plane.add(ieax - 1, iecx + 4, Math.trunc(b / 2));
  plane.add(ieax, iecx + 0, b);
  plane.add(ieax, iecx + 1, a);
  plane.add(ieax, iecx + 2, -(d));
  plane.add(ieax, iecx + 3, a);
  plane.add(ieax, iecx + 4, b);
  plane.add(ieax + 1, iecx + 0, -(c));
  plane.add(ieax + 1, iecx + 1, -(d));
  plane.add(ieax + 1, iecx + 2, d * 3);
  plane.add(ieax + 1, iecx + 3, -(d));
  plane.add(ieax + 1, iecx + 4, -(c));
  plane.add(ieax + 2, iecx + 0, b);
  plane.add(ieax + 2, iecx + 1, a);
  plane.add(ieax + 2, iecx + 2, -(d));
  plane.add(ieax + 2, iecx + 3, a);
  plane.add(ieax + 2, iecx + 4, b);
  plane.add(ieax + 3, iecx + 0, Math.trunc(b / 2));
  plane.add(ieax + 3, iecx + 1, b);
  plane.add(ieax + 3, iecx + 2, -(c));
  plane.add(ieax + 3, iecx + 3, b);
  plane.add(ieax + 3, iecx + 4, Math.trunc(b / 2));
}
