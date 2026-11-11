import { describe, expect, it } from 'vitest';

import { outcomeOf } from './hits';
import { carA, carB, codes, config, gateState, identity, MINUTE, NOW, pedestrianVisit, vehicleVisit } from './test-builders';
import type { VehicleExitScan } from './types';
import { evaluateVehicleExit } from './vehicle-exit';

function exit(overrides: Partial<VehicleExitScan> = {}): VehicleExitScan {
  return {
    at: NOW,
    driver: { personKey: 'person-a' },
    disc: carA,
    typedPlate: carA.plate,
    occupants: 2,
    ignitionRestart: 'done',
    bootCheck: 'not-needed',
    ...overrides,
  };
}

const carAInside = vehicleVisit();
const carBInsideWithB = vehicleVisit({ id: 'visit-car-b', driverKey: 'person-b', vehicle: identity(carB) });

describe('evaluateVehicleExit', () => {
  it('lets the driver who brought the car in take it out', () => {
    expect(evaluateVehicleExit(exit(), gateState({ openVisits: [carAInside] }), config)).toEqual([]);
  });

  it('lets an authorised co-driver take the car out', () => {
    const state = gateState({ openVisits: [vehicleVisit({ coDriverKeys: ['person-partner'] })] });
    expect(evaluateVehicleExit(exit({ driver: { personKey: 'person-partner' } }), state, config)).toEqual([]);
  });

  describe('DRIVER_VEHICLE_MISMATCH', () => {
    it('fires when the driver arrived in a different car, and blocks the boom', () => {
      // person-b came in with car B and is now trying to leave in car A, which person-a brought in.
      const state = gateState({ openVisits: [carAInside, carBInsideWithB] });
      const hits = evaluateVehicleExit(exit({ driver: { personKey: 'person-b' } }), state, config);
      expect(hits).toEqual([{ code: 'DRIVER_VEHICLE_MISMATCH', severity: 'red', relatedVisitId: 'visit-car-b' }]);
      expect(outcomeOf(hits)).toBe('blocked');
    });

    it('wins over WALKED_IN_DRIVING_OUT when the driver has both kinds of open visit', () => {
      const state = gateState({
        openVisits: [carAInside, carBInsideWithB, pedestrianVisit({ personKey: 'person-b' })],
      });
      expect(codes(evaluateVehicleExit(exit({ driver: { personKey: 'person-b' } }), state, config))).toEqual([
        'DRIVER_VEHICLE_MISMATCH',
      ]);
    });
  });

  describe('WALKED_IN_DRIVING_OUT', () => {
    it('fires when the driver came in on foot', () => {
      const state = gateState({ openVisits: [carAInside, pedestrianVisit()] });
      const hits = evaluateVehicleExit(exit({ driver: { personKey: 'person-walker' } }), state, config);
      expect(hits).toEqual([{ code: 'WALKED_IN_DRIVING_OUT', severity: 'red', relatedVisitId: 'visit-on-foot' }]);
    });
  });

  describe('UNKNOWN_DRIVER', () => {
    it('fires when the driver has no entry record of their own', () => {
      const state = gateState({ openVisits: [carAInside] });
      const hits = evaluateVehicleExit(exit({ driver: { personKey: 'person-stranger' } }), state, config);
      expect(hits).toEqual([{ code: 'UNKNOWN_DRIVER', severity: 'red', relatedVisitId: 'visit-car-a' }]);
    });

    it('does not fire for an emergency vehicle let in before anyone was scanned', () => {
      const ambulance = vehicleVisit({ driverKey: null, visitType: 'emergency' });
      expect(evaluateVehicleExit(exit({ driver: { personKey: 'person-paramedic' } }), gateState({ openVisits: [ambulance] }), config)).toEqual([]);
    });

    it('still catches its driver arriving in another car', () => {
      const state = gateState({ openVisits: [vehicleVisit({ driverKey: null, visitType: 'emergency' }), carBInsideWithB] });
      expect(codes(evaluateVehicleExit(exit({ driver: { personKey: 'person-b' } }), state, config))).toEqual(['DRIVER_VEHICLE_MISMATCH']);
    });
  });

  describe('ARRIVED_BEFORE_DIGIGATE', () => {
    const graced = { ...config, launchGraceUntil: NOW + 60 * MINUTE };

    it('asks the guard, not stops the car, when a car with no entry leaves during the launch grace', () => {
      const hits = evaluateVehicleExit(exit(), gateState(), graced);
      expect(hits).toEqual([{ code: 'ARRIVED_BEFORE_DIGIGATE', severity: 'amber' }]);
      expect(outcomeOf(hits)).toBe('warning');
    });

    it('ends by itself: after the grace a car with no entry is stopped again', () => {
      expect(codes(evaluateVehicleExit(exit(), gateState(), { ...config, launchGraceUntil: NOW - 1 }))).toEqual(['NO_ENTRY_RECORD']);
    });

    it('never softens anything else: a driver who came in another car is still stopped', () => {
      const hits = evaluateVehicleExit(exit(), gateState({ openVisits: [vehicleVisit({ id: 'other-car', vehicle: { vin: 'OTHERVIN', plate: 'OTHER 1', discNumber: 'D9' } })] }), graced);
      expect(codes(hits)).toContain('DRIVER_VEHICLE_MISMATCH');
      expect(outcomeOf(hits)).toBe('blocked');
    });

    it('does nothing for a car that has its entry', () => {
      expect(evaluateVehicleExit(exit(), gateState({ openVisits: [carAInside] }), graced)).toEqual([]);
    });
  });

  describe('NO_ENTRY_RECORD', () => {
    it('fires on its own when the car never came in', () => {
      expect(codes(evaluateVehicleExit(exit(), gateState(), config))).toEqual(['NO_ENTRY_RECORD']);
    });

    it('still reports a driver who arrived in another car', () => {
      const state = gateState({ openVisits: [carBInsideWithB] });
      expect(codes(evaluateVehicleExit(exit({ driver: { personKey: 'person-b' } }), state, config))).toEqual([
        'NO_ENTRY_RECORD',
        'DRIVER_VEHICLE_MISMATCH',
      ]);
    });
  });

  describe('PLATE_DISC_MISMATCH', () => {
    it('fires at exit too', () => {
      const state = gateState({ openVisits: [carAInside] });
      expect(codes(evaluateVehicleExit(exit({ typedPlate: 'TEST 999' }), state, config))).toEqual(['PLATE_DISC_MISMATCH']);
    });
  });

  describe('DISC_CLONE_ON_SITE', () => {
    it('fires when another car inside carries this plate', () => {
      const clone = vehicleVisit({ id: 'visit-clone', driverKey: 'person-b', vehicle: { ...identity(carB), plate: carA.plate } });
      const state = gateState({ openVisits: [carAInside, clone] });
      expect(evaluateVehicleExit(exit(), state, config)).toEqual([
        { code: 'DISC_CLONE_ON_SITE', severity: 'red', relatedVisitId: 'visit-clone' },
      ]);
    });

    it('does not treat the car’s own visit as a clone', () => {
      expect(evaluateVehicleExit(exit(), gateState({ openVisits: [carAInside] }), config)).toEqual([]);
    });
  });

  describe('OCCUPANT_COUNT_DROP', () => {
    it('notes fewer people leaving than came in, without blocking', () => {
      const hits = evaluateVehicleExit(exit({ occupants: 1 }), gateState({ openVisits: [carAInside] }), config);
      expect(hits).toEqual([{ code: 'OCCUPANT_COUNT_DROP', severity: 'info', relatedVisitId: 'visit-car-a' }]);
      expect(outcomeOf(hits)).toBe('clear');
    });

    it('notes more people leaving than came in, without blocking', () => {
      const hits = evaluateVehicleExit(exit({ occupants: 4 }), gateState({ openVisits: [carAInside] }), config);
      expect(hits).toEqual([{ code: 'OCCUPANT_COUNT_RISE', severity: 'info', relatedVisitId: 'visit-car-a' }]);
      expect(outcomeOf(hits)).toBe('clear');
    });

    it('notes nothing when the same number leave', () => {
      expect(evaluateVehicleExit(exit(), gateState({ openVisits: [carAInside] }), config)).toEqual([]);
    });
  });

  describe('IGNITION_RESTART_FAILED', () => {
    it('blocks the boom when the engine would not restart', () => {
      const hits = evaluateVehicleExit(exit({ ignitionRestart: 'failed' }), gateState({ openVisits: [carAInside] }), config);
      expect(hits).toEqual([{ code: 'IGNITION_RESTART_FAILED', severity: 'red' }]);
      expect(outcomeOf(hits)).toBe('blocked');
    });

    it('does not fire when the driver restarted the engine', () => {
      expect(evaluateVehicleExit(exit({ ignitionRestart: 'done' }), gateState({ openVisits: [carAInside] }), config)).toEqual([]);
    });

    it('fires alongside the other rules, not instead of them', () => {
      const hits = evaluateVehicleExit(exit({ ignitionRestart: 'failed' }), gateState({ openVisits: [] }), config);
      expect(codes(hits)).toEqual(['NO_ENTRY_RECORD', 'IGNITION_RESTART_FAILED']);
    });
  });

  describe('BOOT_CHECK_PROBLEM', () => {
    it('blocks the boom when the guard found a problem in the boot', () => {
      const hits = evaluateVehicleExit(exit({ bootCheck: 'problem' }), gateState({ openVisits: [carAInside] }), config);
      expect(hits).toEqual([{ code: 'BOOT_CHECK_PROBLEM', severity: 'red' }]);
      expect(outcomeOf(hits)).toBe('blocked');
    });

    it('does not fire when the boot was clear or not opened', () => {
      const state = gateState({ openVisits: [carAInside] });
      expect(evaluateVehicleExit(exit({ bootCheck: 'clear' }), state, config)).toEqual([]);
      expect(evaluateVehicleExit(exit({ bootCheck: 'not-needed' }), state, config)).toEqual([]);
    });
  });

  describe('OVERSTAY', () => {
    it('fires when the visit ran past its limit', () => {
      const state = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 300 * MINUTE })] });
      expect(codes(evaluateVehicleExit(exit(), state, config))).toEqual(['OVERSTAY']);
    });

    it('does not fire for a visit type without a limit', () => {
      const state = gateState({ openVisits: [vehicleVisit({ visitType: 'staff', enteredAt: NOW - 900 * MINUTE })] });
      expect(evaluateVehicleExit(exit(), state, config)).toEqual([]);
    });

    it('only notes it, so the car still leaves', () => {
      const state = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 300 * MINUTE })] });
      expect(outcomeOf(evaluateVehicleExit(exit(), state, config))).toBe('clear');
    });

    it('goes by the stay recorded at entry over the visit type', () => {
      const short = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 90 * MINUTE, expectedStayMinutes: 60 })] });
      expect(codes(evaluateVehicleExit(exit(), short, config))).toEqual(['OVERSTAY']);
      const long = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 300 * MINUTE, expectedStayMinutes: 480 })] });
      expect(evaluateVehicleExit(exit(), long, config)).toEqual([]);
    });

    it('never fires when the guard recorded no limit', () => {
      const state = gateState({ openVisits: [vehicleVisit({ enteredAt: NOW - 900 * MINUTE, expectedStayMinutes: null })] });
      expect(evaluateVehicleExit(exit(), state, config)).toEqual([]);
    });
  });
});

describe('DISC_CHANGED_ON_SITE', () => {
  const insideWithExpiry = vehicleVisit({ discExpiresOn: carA.expiresOn });

  it('fires when the car leaves with an older disc carrying another plate, and blocks the boom', () => {
    const oldDisc = { ...carA, plate: 'TEST 900', discNumber: 'DISCTEST900', expiresOn: '2025-01-31' };
    const hits = evaluateVehicleExit(exit({ disc: oldDisc, typedPlate: oldDisc.plate }), gateState({ openVisits: [insideWithExpiry] }), config);
    expect(hits).toEqual([{ code: 'DISC_CHANGED_ON_SITE', severity: 'red', relatedVisitId: 'visit-car-a' }]);
    expect(outcomeOf(hits)).toBe('blocked');
  });

  it('fires on a different disc number alone', () => {
    const swapped = { ...carA, discNumber: 'DISCTEST777' };
    expect(codes(evaluateVehicleExit(exit({ disc: swapped }), gateState({ openVisits: [insideWithExpiry] }), config))).toEqual(['DISC_CHANGED_ON_SITE']);
  });

  it('fires on a different expiry alone', () => {
    const older = { ...carA, expiresOn: '2026-01-31' };
    expect(codes(evaluateVehicleExit(exit({ disc: older }), gateState({ openVisits: [insideWithExpiry] }), config))).toEqual(['DISC_CHANGED_ON_SITE']);
  });

  it('does not fire for the disc it came in with, however the plate is spaced', () => {
    const sameDisc = { ...carA, plate: 'test-001', discNumber: 'disctest001' };
    expect(evaluateVehicleExit(exit({ disc: sameDisc, typedPlate: 'TEST001' }), gateState({ openVisits: [insideWithExpiry] }), config)).toEqual([]);
  });

  it('compares expiry only when it was recorded at entry', () => {
    const older = { ...carA, expiresOn: '2026-01-31' };
    expect(evaluateVehicleExit(exit({ disc: older }), gateState({ openVisits: [carAInside] }), config)).toEqual([]);
  });

  it('is not raised without an entry record, which NO_ENTRY_RECORD covers', () => {
    expect(codes(evaluateVehicleExit(exit({ disc: { ...carA, plate: 'TEST 900' }, typedPlate: 'TEST 900' }), gateState(), config))).toEqual(['NO_ENTRY_RECORD']);
  });
});

describe('a car entered by hand, with no disc', () => {
  const handTyped = { vin: '', plate: 'TEST 001', discNumber: '', expiresOn: '' };

  it('is matched to its visit by plate', () => {
    const inside = vehicleVisit({ vehicle: { vin: '', plate: 'TEST001', discNumber: '' } });
    expect(evaluateVehicleExit(exit({ disc: handTyped, typedPlate: 'TEST 001' }), gateState({ openVisits: [inside] }), config)).toEqual([]);
  });

  it('is never a clone of a scanned car with the same plate', () => {
    expect(codes(evaluateVehicleExit(exit({ disc: handTyped, typedPlate: 'TEST 001' }), gateState({ openVisits: [carAInside] }), config))).not.toContain('DISC_CLONE_ON_SITE');
  });

  it('still notices the driver leaving with a different plate', () => {
    const inside = vehicleVisit({ vehicle: { vin: '', plate: 'TEST001', discNumber: '' } });
    const other = { ...handTyped, plate: 'TEST 999' };
    expect(codes(evaluateVehicleExit(exit({ disc: other, typedPlate: 'TEST 999' }), gateState({ openVisits: [inside] }), config))).toEqual(['NO_ENTRY_RECORD', 'DRIVER_VEHICLE_MISMATCH']);
  });
});
