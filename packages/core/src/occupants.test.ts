import { describe, expect, it } from 'vitest';

import { describeOccupants, occupantChange, occupantsOf, occupantTotal } from './occupants';

describe('occupantsOf', () => {
  it('reads the counts a check carries', () => {
    expect(occupantsOf({ male: 2, female: 1, unknown: 0 })).toEqual({ male: 2, female: 1, unknown: 0 });
  });

  it('treats anything that is not a whole count as none', () => {
    expect(occupantsOf({ male: 1, female: -2, unknown: 1.5 })).toEqual({ male: 1, female: 0, unknown: 0 });
  });

  it('has nothing for a check from before the counts were asked', () => {
    expect(occupantsOf(undefined)).toBeNull();
    expect(occupantsOf(3)).toBeNull();
    expect(occupantsOf({ male: 0, female: 0, unknown: 0 })).toBeNull();
  });
});

describe('describeOccupants', () => {
  it('says who was counted, in plain words', () => {
    expect(describeOccupants({ male: 2, female: 1, unknown: 1 })).toBe('2 men, 1 woman, 1 not sure');
    expect(describeOccupants({ male: 1, female: 2, unknown: 0 })).toBe('1 man, 2 women');
  });

  it('says so when nobody was counted', () => {
    expect(describeOccupants({ male: 0, female: 0, unknown: 0 })).toBe('Nobody counted');
  });
});

describe('occupantChange', () => {
  it('says which way the count changed', () => {
    expect(occupantChange(3, 2)).toBe('fewer');
    expect(occupantChange(1, 2)).toBe('more');
    expect(occupantChange(2, 2)).toBeNull();
  });
});

describe('occupantTotal', () => {
  it('adds everyone up', () => {
    expect(occupantTotal({ male: 1, female: 1, unknown: 2 })).toBe(4);
  });
});
