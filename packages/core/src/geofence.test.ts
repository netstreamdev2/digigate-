import { describe, expect, it } from 'vitest';

import {
  distanceMetres,
  FENCE_START,
  LEAVING_CONFIRMS_AFTER_MS,
  RETURNING_CONFIRMS_AFTER_MS,
  sideOfFence,
  stepFence,
  WORST_USEFUL_ACCURACY_M,
  type Fence,
  type FenceState,
  type Fix,
} from './geofence';

// Near Cape Town: at this latitude, 0.001 degrees of latitude is about 111 m.
const POST = { latitude: -33.9249, longitude: 18.4241 };
const fence: Fence = { ...POST, radiusM: 50 };

/** A reading some metres due north of the post. */
const fixAt = (metres: number, at: number, accuracyM = 8): Fix => ({ latitude: POST.latitude + metres / 111_195, longitude: POST.longitude, accuracyM, at });

function walk(fixes: readonly Fix[], start: FenceState = FENCE_START, pausedUntil: number | null = null) {
  let state = start;
  const changes: string[] = [];
  for (const fix of fixes) {
    const next = stepFence(state, fix, fence, pausedUntil);
    state = next.state;
    if (next.change) changes.push(next.change);
  }
  return { state, changes };
}

describe('distanceMetres', () => {
  it('is zero to itself', () => {
    expect(distanceMetres(POST, POST)).toBe(0);
  });

  it('measures a known distance', () => {
    expect(distanceMetres(POST, fixAt(100, 0))).toBeCloseTo(100, 0);
  });

  it('measures across a line of longitude, which shrinks away from the equator', () => {
    const east = { latitude: POST.latitude, longitude: POST.longitude + 0.001 };
    expect(distanceMetres(POST, east)).toBeCloseTo(92.3, 0);
  });
});

describe('sideOfFence', () => {
  it('puts a clear reading inside', () => {
    expect(sideOfFence(fixAt(10, 0), fence)).toBe('inside');
  });

  it('puts a clear reading outside', () => {
    expect(sideOfFence(fixAt(120, 0), fence)).toBe('outside');
  });

  it('trusts a reading only as far as its error margin', () => {
    expect(sideOfFence(fixAt(70, 0, 30), fence)).toBeNull();
    expect(sideOfFence(fixAt(70, 0, 15), fence)).toBe('outside');
  });

  it('ignores a reading too vague to use, wherever it lands', () => {
    expect(sideOfFence(fixAt(500, 0, WORST_USEFUL_ACCURACY_M + 1), fence)).toBeNull();
  });
});

describe('stepFence', () => {
  it('stays quiet while the guard is at their post', () => {
    expect(walk([fixAt(5, 0), fixAt(12, 30_000), fixAt(3, 60_000)]).changes).toEqual([]);
  });

  it('says nothing on one reading outside', () => {
    expect(walk([fixAt(200, 0)]).changes).toEqual([]);
  });

  it('warns once readings have agreed for long enough', () => {
    const { state, changes } = walk([fixAt(120, 0), fixAt(130, 30_000), fixAt(140, LEAVING_CONFIRMS_AFTER_MS)]);
    expect(changes).toEqual(['left']);
    expect(state.side).toBe('outside');
  });

  it('warns only once for one departure', () => {
    expect(walk([fixAt(120, 0), fixAt(130, LEAVING_CONFIRMS_AFTER_MS), fixAt(150, LEAVING_CONFIRMS_AFTER_MS + 30_000), fixAt(170, LEAVING_CONFIRMS_AFTER_MS * 3)]).changes).toEqual(['left']);
  });

  it('forgets a drifting reading when the next good one is back inside', () => {
    expect(walk([fixAt(120, 0), fixAt(5, 20_000), fixAt(120, 40_000), fixAt(5, 70_000), fixAt(120, 90_000)]).changes).toEqual([]);
  });

  it('carries on counting through a reading that can not say', () => {
    expect(walk([fixAt(120, 0), fixAt(120, 30_000, WORST_USEFUL_ACCURACY_M + 20), fixAt(130, LEAVING_CONFIRMS_AFTER_MS)]).changes).toEqual(['left']);
  });

  it('never warns on readings too vague to use, however far off', () => {
    expect(walk([fixAt(900, 0, 80), fixAt(900, 90_000, 80), fixAt(900, 300_000, 80)]).changes).toEqual([]);
  });

  it('says when the guard is back', () => {
    const away: FenceState = { side: 'outside', changingSince: null };
    const { state, changes } = walk([fixAt(5, 0), fixAt(5, RETURNING_CONFIRMS_AFTER_MS)], away);
    expect(changes).toEqual(['returned']);
    expect(state.side).toBe('inside');
  });

  it('believes a return sooner than a departure', () => {
    expect(RETURNING_CONFIRMS_AFTER_MS).toBeLessThan(LEAVING_CONFIRMS_AFTER_MS);
  });

  it('counts nothing while the guard is stepping away', () => {
    const pausedUntil = 600_000;
    expect(walk([fixAt(300, 0), fixAt(300, 300_000), fixAt(300, 599_000)], FENCE_START, pausedUntil).changes).toEqual([]);
  });

  it('forgets a departure already under way when the guard steps away', () => {
    const counting = stepFence(FENCE_START, fixAt(200, 0), fence, null).state;
    expect(stepFence(counting, fixAt(200, 10_000), fence, 600_000).state.changingSince).toBeNull();
  });

  it('judges afresh once the pause runs out, with the full wait', () => {
    const pausedUntil = 600_000;
    const early = walk([fixAt(300, 0), fixAt(300, pausedUntil + 1000)], FENCE_START, pausedUntil);
    expect(early.changes).toEqual([]);
    const late = walk([fixAt(300, pausedUntil + 1000), fixAt(300, pausedUntil + 1000 + LEAVING_CONFIRMS_AFTER_MS)], FENCE_START, pausedUntil);
    expect(late.changes).toEqual(['left']);
  });
});
