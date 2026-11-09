import { describe, expect, it } from 'vitest';

import { childrenOf, describeOccupants, NO_OCCUPANTS, occupantChange, occupantsOf, occupantTotal } from './occupants';

describe('occupantsOf', () => {
  it('reads the counts a check carries', () => {
    expect(occupantsOf({ male: 2, female: 1, boy: 1, girl: 2, unknown: 0 })).toEqual({ male: 2, female: 1, boy: 1, girl: 2, unknown: 0 });
  });

  it('reads a check from before children were counted as having none', () => {
    expect(occupantsOf({ male: 2, female: 1, unknown: 0 })).toEqual({ male: 2, female: 1, boy: 0, girl: 0, unknown: 0 });
  });

  it('treats anything that is not a whole count as none', () => {
    expect(occupantsOf({ male: 1, female: -2, boy: '1', girl: 0.5, unknown: 1.5 })).toEqual({ ...NO_OCCUPANTS, male: 1 });
  });

  it('has nothing for a check from before the counts were asked', () => {
    expect(occupantsOf(undefined)).toBeNull();
    expect(occupantsOf(3)).toBeNull();
    expect(occupantsOf(NO_OCCUPANTS)).toBeNull();
  });

  it('counts a car with only children in the back as occupied', () => {
    expect(occupantsOf({ boy: 1 })).toEqual({ ...NO_OCCUPANTS, boy: 1 });
  });
});

describe('describeOccupants', () => {
  it('says who was counted, in plain words', () => {
    expect(describeOccupants({ male: 2, female: 1, boy: 0, girl: 0, unknown: 1 })).toBe('2 men, 1 woman, 1 not sure');
    expect(describeOccupants({ male: 1, female: 2, boy: 0, girl: 0, unknown: 0 })).toBe('1 man, 2 women');
  });

  it('names the children too', () => {
    expect(describeOccupants({ male: 1, female: 1, boy: 1, girl: 2, unknown: 0 })).toBe('1 man, 1 woman, 1 boy, 2 girls');
    expect(describeOccupants({ male: 0, female: 1, boy: 2, girl: 1, unknown: 0 })).toBe('1 woman, 2 boys, 1 girl');
  });

  it('says so when nobody was counted', () => {
    expect(describeOccupants(NO_OCCUPANTS)).toBe('Nobody counted');
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
  it('adds everyone up, children included', () => {
    expect(occupantTotal({ male: 1, female: 1, boy: 1, girl: 1, unknown: 2 })).toBe(6);
  });
});

describe('childrenOf', () => {
  it('counts the boys and girls', () => {
    expect(childrenOf({ male: 1, female: 1, boy: 2, girl: 1, unknown: 1 })).toBe(3);
    expect(childrenOf(NO_OCCUPANTS)).toBe(0);
  });
});
