import { describe, expect, it } from 'vitest';

import { bandRect, levelCount, levelSize } from './geometry';

describe('levelSize', () => {
  it('halves each level and keeps the edge samples, as the codec sizes a 250 by 200 licence photo', () => {
    expect([0, 1, 2, 3, 4, 5].map((level) => levelSize(250, level))).toEqual([250, 126, 64, 33, 17, 9]);
    expect([0, 1, 2, 3, 4, 5].map((level) => levelSize(200, level))).toEqual([200, 101, 51, 26, 14, 8]);
  });
});

describe('levelCount', () => {
  it('uses five levels for a licence photo', () => {
    expect(levelCount(250, 200)).toBe(5);
  });

  it('goes by the smaller side and never drops below zero', () => {
    expect(levelCount(10, 1000)).toBe(1);
    expect(levelCount(4, 4)).toBe(0);
    expect(levelCount(2, 2)).toBe(0);
  });
});

describe('bandRect', () => {
  it('places the three detail bands around the coarser picture in the top left', () => {
    expect(bandRect(250, 200, 0, 0)).toEqual({ rowStart: 0, rowEnd: 126, colStart: 101, colEnd: 200 });
    expect(bandRect(250, 200, 0, 1)).toEqual({ rowStart: 126, rowEnd: 250, colStart: 0, colEnd: 101 });
    expect(bandRect(250, 200, 0, 2)).toEqual({ rowStart: 126, rowEnd: 250, colStart: 101, colEnd: 200 });
  });

  it('nests each level inside the coarser picture of the one above', () => {
    expect(bandRect(250, 200, 1, 2)).toEqual({ rowStart: 64, rowEnd: 126, colStart: 51, colEnd: 101 });
  });
});
