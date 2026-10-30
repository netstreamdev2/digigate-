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

    it('does not fire when more people leave', () => {
      expect(evaluateVehicleExit(exit({ occupants: 4 }), gateState({ openVisits: [carAInside] }), config)).toEqual([]);
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
  });
});
