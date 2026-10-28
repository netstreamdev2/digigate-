import { describe, expect, it } from 'vitest';

import { outcomeOf } from './hits';

describe('outcomeOf', () => {
  it('is clear with no hits or only info', () => {
    expect(outcomeOf([])).toBe('clear');
    expect(outcomeOf([{ code: 'UNFAMILIAR_VEHICLE', severity: 'info' }])).toBe('clear');
  });

  it('is a warning when the worst hit is amber', () => {
    expect(outcomeOf([{ code: 'DISC_EXPIRED', severity: 'amber' }, { code: 'UNFAMILIAR_VEHICLE', severity: 'info' }])).toBe(
      'warning',
    );
  });

  it('is blocked when any hit is red', () => {
    expect(outcomeOf([{ code: 'DISC_EXPIRED', severity: 'amber' }, { code: 'UNKNOWN_DRIVER', severity: 'red' }])).toBe(
      'blocked',
    );
  });
});
