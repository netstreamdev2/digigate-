import { describe, expect, it } from 'vitest';

import { vehicleBodyFromDisc } from './vehicle-body';

describe('vehicleBodyFromDisc', () => {
  it('knows the description seen on a real disc', () => {
    expect(vehicleBodyFromDisc('Hatch back / Luikrug')).toBe('hatchback');
  });

  it('ignores case and stray spacing', () => {
    expect(vehicleBodyFromDisc('  HATCH BACK  /  luikrug ')).toBe('hatchback');
    expect(vehicleBodyFromDisc('Hatchback')).toBe('hatchback');
  });

  it('reads the body from either language', () => {
    expect(vehicleBodyFromDisc('Sedan (closed top) / Sedan (toe-kap)')).toBe('sedan');
    expect(vehicleBodyFromDisc('Dubbelkajuit')).toBe('bakkie-double-cab');
    expect(vehicleBodyFromDisc('Paneelwa')).toBe('panel-van');
    expect(vehicleBodyFromDisc('Motorfiets')).toBe('motorbike');
  });

  it('takes the most specific shape first', () => {
    expect(vehicleBodyFromDisc('Pick-up (double cab) / Oopbak (dubbelkajuit)')).toBe('bakkie-double-cab');
    expect(vehicleBodyFromDisc('Pick-up (single cab) / Oopbak (enkelkajuit)')).toBe('bakkie-single-cab');
    expect(vehicleBodyFromDisc('Truck tractor / Voorhaker')).toBe('truck-heavy');
    expect(vehicleBodyFromDisc('Truck / Vragmotor')).toBe('truck-light');
    expect(vehicleBodyFromDisc('Mini bus / Minibus')).toBe('minibus');
  });

  it('draws nothing for a description that could be more than one shape', () => {
    expect(vehicleBodyFromDisc('Station wagon / Stasiewa')).toBeNull();
  });

  it('has no body for an empty or unknown description', () => {
    expect(vehicleBodyFromDisc('')).toBeNull();
    expect(vehicleBodyFromDisc('Caravan / Woonwa')).toBeNull();
  });
});
