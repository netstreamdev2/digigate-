import { describe, expect, it } from 'vitest';

import { isSiteType, visitTypesFor } from './site-types';

describe('visitTypesFor', () => {
  it("gives a hospital its own visit types, with no host-based ones", () => {
    expect(visitTypesFor('hospital').map((type) => type.code)).toEqual(['visitor', 'staff', 'delivery', 'contractor', 'patient_dropoff', 'emergency']);
  });

  it('gives an estate residents and domestic workers', () => {
    expect(visitTypesFor('estate').map((type) => type.code)).toContain('domestic_worker');
  });

  it("gives an unknown site type none, never another type's", () => {
    expect(visitTypesFor('mine')).toEqual([]);
    expect(isSiteType('mine')).toBe(false);
  });
});
