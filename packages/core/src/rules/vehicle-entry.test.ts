import { describe, expect, it } from 'vitest';

import { carA, carB, codes, config, gateState, identity, MINUTE, NOW, registered, vehicleVisit } from './test-builders';
import type { VehicleEntryScan } from './types';
import { evaluateVehicleEntry } from './vehicle-entry';

function entry(overrides: Partial<VehicleEntryScan> = {}): VehicleEntryScan {
  return {
    at: NOW,
    driver: { personKey: 'person-a', licenceExpiresOn: '2029-08-14' },
    disc: carA,
    typedPlate: carA.plate,
    ...overrides,
  };
}

describe('evaluateVehicleEntry', () => {
  it('lets a clean car in with no hits', () => {
    expect(evaluateVehicleEntry(entry(), gateState(), config)).toEqual([]);
  });

  describe('PLATE_DISC_MISMATCH', () => {
    it('fires when the plate on the car differs from the disc', () => {
      expect(codes(evaluateVehicleEntry(entry({ typedPlate: 'TEST 999' }), gateState(), config))).toEqual([
        'PLATE_DISC_MISMATCH',
      ]);
    });

    it('ignores spacing, dashes and case', () => {
      expect(evaluateVehicleEntry(entry({ typedPlate: 'test-001' }), gateState(), config)).toEqual([]);
    });
  });

  describe('DUPLICATE_ENTRY', () => {
    it('fires when the same car is already inside', () => {
      const hits = evaluateVehicleEntry(entry(), gateState({ openVisits: [vehicleVisit()] }), config);
      expect(hits).toEqual([{ code: 'DUPLICATE_ENTRY', severity: 'amber', relatedVisitId: 'visit-car-a' }]);
    });

    it('does not fire for a different car inside', () => {
      const state = gateState({ openVisits: [vehicleVisit({ id: 'visit-car-b', vehicle: identity(carB) })] });
      expect(evaluateVehicleEntry(entry(), state, config)).toEqual([]);
    });
  });

  describe('DISC_CLONE_ON_SITE', () => {
    it('fires when a car inside has this VIN under another plate, and does not also report a duplicate', () => {
      const state = gateState({ openVisits: [vehicleVisit({ vehicle: { ...identity(carA), plate: 'CLONE 01' } })] });
      expect(evaluateVehicleEntry(entry(), state, config)).toEqual([
        { code: 'DISC_CLONE_ON_SITE', severity: 'red', relatedVisitId: 'visit-car-a' },
      ]);
    });

    it('fires when a car inside has this disc number under another plate', () => {
      const state = gateState({
        openVisits: [vehicleVisit({ id: 'visit-car-b', vehicle: { ...identity(carB), discNumber: carA.discNumber } })],
      });
      expect(codes(evaluateVehicleEntry(entry(), state, config))).toEqual(['DISC_CLONE_ON_SITE']);
    });

    it('fires when a car inside has this plate under another VIN', () => {
      const state = gateState({
        openVisits: [vehicleVisit({ id: 'visit-car-b', vehicle: { ...identity(carB), plate: carA.plate } })],
      });
      expect(codes(evaluateVehicleEntry(entry(), state, config))).toEqual(['DISC_CLONE_ON_SITE']);
    });
  });

  describe('PLATE_VIN_HISTORY_CONFLICT', () => {
    it('fires when this plate was seen before with another VIN', () => {
      const state = gateState({ vehicleHistory: [{ vin: carB.vin, plate: carA.plate }] });
      expect(codes(evaluateVehicleEntry(entry(), state, config))).toEqual(['PLATE_VIN_HISTORY_CONFLICT']);
    });

    it('fires when this VIN was seen before with another plate', () => {
      const state = gateState({ vehicleHistory: [{ vin: carA.vin, plate: 'OLD 123' }] });
      expect(codes(evaluateVehicleEntry(entry(), state, config))).toEqual(['PLATE_VIN_HISTORY_CONFLICT']);
    });

    it('does not fire when history matches this car', () => {
      const state = gateState({ vehicleHistory: [{ vin: carA.vin, plate: 'test001' }] });
      expect(evaluateVehicleEntry(entry(), state, config)).toEqual([]);
    });

    it('is not reported on top of a clone already on site', () => {
      const state = gateState({
        openVisits: [vehicleVisit({ vehicle: { ...identity(carA), plate: 'CLONE 01' } })],
        vehicleHistory: [{ vin: carA.vin, plate: 'CLONE 01' }],
      });
      expect(codes(evaluateVehicleEntry(entry(), state, config))).toEqual(['DISC_CLONE_ON_SITE']);
    });
  });

  describe('DISC_EXPIRED', () => {
    it('fires the day after the disc expires', () => {
      const scan = entry({ disc: { ...carA, expiresOn: '2026-10-27' } });
      expect(codes(evaluateVehicleEntry(scan, gateState(), config))).toEqual(['DISC_EXPIRED']);
    });

    it('does not fire on the expiry date itself', () => {
      const scan = entry({ disc: { ...carA, expiresOn: '2026-10-28' } });
      expect(evaluateVehicleEntry(scan, gateState(), config)).toEqual([]);
    });

    it('uses the date at the site, not UTC', () => {
      // 22:30 UTC on 28 Oct is already 29 Oct in SAST.
      const scan = entry({ at: Date.UTC(2026, 9, 28, 22, 30), disc: { ...carA, expiresOn: '2026-10-28' } });
      expect(codes(evaluateVehicleEntry(scan, gateState(), config))).toEqual(['DISC_EXPIRED']);
    });
  });

  describe('LICENCE_EXPIRED', () => {
    it('fires when the driver licence has expired', () => {
      const scan = entry({ driver: { personKey: 'person-a', licenceExpiresOn: '2026-01-01' } });
      expect(codes(evaluateVehicleEntry(scan, gateState(), config))).toEqual(['LICENCE_EXPIRED']);
    });

    it('does not fire when there is no licence expiry, as with manual entry', () => {
      const scan = entry({ driver: { personKey: 'person-a' } });
      expect(evaluateVehicleEntry(scan, gateState(), config)).toEqual([]);
    });
  });

  describe('UNFAMILIAR_VEHICLE', () => {
    it('fires when an approved registered person arrives in a car not on their list', () => {
      const state = gateState({ registeredPeople: registered('person-a', [carB.vin]) });
      expect(evaluateVehicleEntry(entry(), state, config)).toEqual([{ code: 'UNFAMILIAR_VEHICLE', severity: 'info' }]);
    });

    it('does not fire for a car they are known to use', () => {
      const state = gateState({ registeredPeople: registered('person-a', [carA.vin.toLowerCase()]) });
      expect(evaluateVehicleEntry(entry(), state, config)).toEqual([]);
    });

    it('does not fire while the person is still pending approval', () => {
      const state = gateState({ registeredPeople: registered('person-a', [], 'pending') });
      expect(evaluateVehicleEntry(entry(), state, config)).toEqual([]);
    });
  });

  it('lists red hits before amber and info', () => {
    const scan = entry({ typedPlate: 'TEST 999', disc: { ...carA, expiresOn: '2026-01-01' } });
    const state = gateState({ registeredPeople: registered('person-a', []) });
    expect(codes(evaluateVehicleEntry(scan, state, config))).toEqual([
      'PLATE_DISC_MISMATCH',
      'DISC_EXPIRED',
      'UNFAMILIAR_VEHICLE',
    ]);
  });

  it('drops rules the site has switched off', () => {
    const scan = entry({ disc: { ...carA, expiresOn: '2026-01-01' } });
    expect(evaluateVehicleEntry(scan, gateState(), { ...config, disabledRules: ['DISC_EXPIRED'] })).toEqual([]);
  });

  it('does not care how long other visits have been open', () => {
    const state = gateState({ openVisits: [vehicleVisit({ id: 'visit-car-b', vehicle: identity(carB), enteredAt: NOW - 600 * MINUTE })] });
    expect(evaluateVehicleEntry(entry(), state, config)).toEqual([]);
  });
});
