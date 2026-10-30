import { describe, expect, it } from 'vitest';

import { vehicleBodyFromDisc } from './vehicle-body';

describe('vehicleBodyFromDisc', () => {
  it('knows a description seen on a real disc', () => {
    expect(vehicleBodyFromDisc('Hatch back / Luikrug')).toBe('hatchback');
  });

  it('ignores case and stray spacing', () => {
    expect(vehicleBodyFromDisc('  HATCH BACK  /  luikrug ')).toBe('hatchback');
  });

  it("doesn't guess a description it hasn't seen", () => {
    expect(vehicleBodyFromDisc('Hatchback')).toBeNull();
    expect(vehicleBodyFromDisc('Hatch back')).toBeNull();
    expect(vehicleBodyFromDisc('Sedan (closed top) / Sedan (toe-kap)')).toBeNull();
  });

  it('has no body for an empty description', () => {
    expect(vehicleBodyFromDisc('')).toBeNull();
  });
});
