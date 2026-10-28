import { describe, expect, it } from 'vitest';

import { findOverstays } from './overstay';
import { config, gateState, MINUTE, NOW, pedestrianVisit, vehicleVisit } from './test-builders';

describe('findOverstays', () => {
  it('reports every open visit past its limit', () => {
    const state = gateState({
      openVisits: [
        vehicleVisit({ id: 'long-car', enteredAt: NOW - 241 * MINUTE }),
        pedestrianVisit({ id: 'long-walk', enteredAt: NOW - 500 * MINUTE }),
        vehicleVisit({ id: 'short-car', enteredAt: NOW - 30 * MINUTE }),
      ],
    });
    expect(findOverstays(state, NOW, config)).toEqual([
      { code: 'OVERSTAY', severity: 'amber', relatedVisitId: 'long-car' },
      { code: 'OVERSTAY', severity: 'amber', relatedVisitId: 'long-walk' },
    ]);
  });

  it('allows a visit to last exactly its limit', () => {
    const state = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 240 * MINUTE })] });
    expect(findOverstays(state, NOW, config)).toEqual([]);
  });

  it('ignores visit types with no limit', () => {
    const state = gateState({ openVisits: [vehicleVisit({ visitType: 'emergency', enteredAt: NOW - 2000 * MINUTE })] });
    expect(findOverstays(state, NOW, config)).toEqual([]);
  });

  it('returns nothing when the site has switched the rule off', () => {
    const state = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 500 * MINUTE })] });
    expect(findOverstays(state, NOW, { ...config, disabledRules: ['OVERSTAY'] })).toEqual([]);
  });
});
