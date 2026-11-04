import { describe, expect, it } from 'vitest';

import { carParkState } from './car-park';

describe('carParkState', () => {
  it('says how many spaces are free', () => {
    expect(carParkState({ open: false, spaces: 100 }, 40)).toEqual({ kind: 'counted', spaces: 100, parked: 40, free: 60, full: false, nearlyFull: false });
  });

  it('warns from nine in ten spaces taken', () => {
    expect(carParkState({ open: false, spaces: 100 }, 90)).toMatchObject({ free: 10, nearlyFull: true, full: false });
    expect(carParkState({ open: false, spaces: 100 }, 89)).toMatchObject({ nearlyFull: false });
  });

  it('is full when every space is taken', () => {
    expect(carParkState({ open: false, spaces: 100 }, 100)).toMatchObject({ free: 0, full: true, nearlyFull: false });
  });

  it('never has less than nothing free when more cars are in than there are spaces', () => {
    expect(carParkState({ open: false, spaces: 10 }, 14)).toMatchObject({ free: 0, full: true });
  });

  it('keeps no count for open parking, or a site with no spaces set', () => {
    expect(carParkState({ open: true, spaces: null }, 7)).toEqual({ kind: 'open', parked: 7 });
    expect(carParkState({ open: false, spaces: null }, 7)).toEqual({ kind: 'open', parked: 7 });
    expect(carParkState({ open: false, spaces: 0 }, 7)).toEqual({ kind: 'open', parked: 7 });
  });

  it('knows nothing until the site has synced', () => {
    expect(carParkState(null, 3)).toEqual({ kind: 'unknown' });
  });
});
