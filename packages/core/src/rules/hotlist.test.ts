import { describe, expect, it } from 'vitest';

import { hotlistEntryFor } from './hotlist';
import { evaluatePedestrianEntry, evaluatePedestrianExit } from './pedestrian';
import { carA, carB, codes, config, gateState, NOW, pedestrianVisit, vehicleVisit } from './test-builders';
import type { HotlistEntry, VehicleEntryScan, VehicleExitScan } from './types';
import { evaluateVehicleEntry } from './vehicle-entry';
import { evaluateVehicleExit } from './vehicle-exit';

const wantedPerson: HotlistEntry = { id: 'hot-person', kind: 'person', key: 'person-a' };
const wantedPlate: HotlistEntry = { id: 'hot-plate', kind: 'plate', key: 'test-001' };
const wantedVin: HotlistEntry = { id: 'hot-vin', kind: 'vin', key: 'testvin0000000001' };

const entry = (overrides: Partial<VehicleEntryScan> = {}): VehicleEntryScan => ({
  at: NOW,
  driver: { personKey: 'person-a' },
  disc: carA,
  typedPlate: carA.plate,
  ...overrides,
});

const exit = (overrides: Partial<VehicleExitScan> = {}): VehicleExitScan => ({
  at: NOW,
  driver: { personKey: 'person-a' },
  disc: carA,
  typedPlate: carA.plate,
  occupants: 2,
  ignitionRestart: 'done',
  bootCheck: 'not-needed',
  ...overrides,
});

describe('hotlistEntryFor', () => {
  it('finds a person by their key', () => {
    expect(hotlistEntryFor({ personKeys: ['person-a'], plates: [], vins: [] }, [wantedPerson])).toBe(wantedPerson);
  });

  it('matches a plate however it is written', () => {
    expect(hotlistEntryFor({ personKeys: [], plates: ['TEST 001'], vins: [] }, [wantedPlate])).toBe(wantedPlate);
  });

  it('matches a VIN however it is written', () => {
    expect(hotlistEntryFor({ personKeys: [], plates: [], vins: ['TESTVIN 0000000001'] }, [wantedVin])).toBe(wantedVin);
  });

  it('never matches an entry with nothing in it', () => {
    const empty: HotlistEntry[] = [
      { id: 'blank-plate', kind: 'plate', key: ' - ' },
      { id: 'blank-person', kind: 'person', key: '' },
    ];
    expect(hotlistEntryFor({ personKeys: [''], plates: [''], vins: [''] }, empty)).toBeUndefined();
  });

  it('never matches a car typed in without a VIN against a VIN entry', () => {
    expect(hotlistEntryFor({ personKeys: [], plates: ['TEST 009'], vins: [''] }, [wantedVin])).toBeUndefined();
  });

  it('does not take a plate for a VIN, or a person key for a plate', () => {
    expect(hotlistEntryFor({ personKeys: ['test-001'], plates: [], vins: ['TEST001'] }, [wantedPlate])).toBeUndefined();
  });
});

describe('HOTLIST_MATCH at a vehicle entry', () => {
  it('stops a hotlisted driver, first of all the hits', () => {
    const state = gateState({ hotlist: [wantedPerson], openVisits: [vehicleVisit()] });
    const hits = evaluateVehicleEntry(entry(), state, config);
    expect(hits[0]).toEqual({ code: 'HOTLIST_MATCH', severity: 'red', hotlistEntryId: 'hot-person' });
    expect(codes(hits)).toContain('DUPLICATE_ENTRY');
  });

  it('stops a car whose plate is on the list, read off the car though not on the disc', () => {
    const state = gateState({ hotlist: [wantedPlate] });
    const hits = evaluateVehicleEntry(entry({ disc: carB, typedPlate: 'TEST 001' }), state, config);
    expect(codes(hits)).toEqual(['HOTLIST_MATCH', 'PLATE_DISC_MISMATCH']);
  });

  it('stops a car by its VIN under another plate', () => {
    const state = gateState({ hotlist: [wantedVin] });
    const hits = evaluateVehicleEntry(entry({ disc: { ...carA, plate: 'TEST 777' }, typedPlate: 'TEST 777' }), state, config);
    expect(codes(hits)).toEqual(['HOTLIST_MATCH']);
  });

  it('lets anyone else through', () => {
    const state = gateState({ hotlist: [wantedPerson, wantedPlate, wantedVin] });
    expect(evaluateVehicleEntry(entry({ driver: { personKey: 'person-b' }, disc: carB, typedPlate: carB.plate }), state, config)).toEqual([]);
  });

  it('is gone when the site switches it off', () => {
    const state = gateState({ hotlist: [wantedPerson] });
    expect(evaluateVehicleEntry(entry(), state, { ...config, disabledRules: ['HOTLIST_MATCH'] })).toEqual([]);
  });
});

describe('HOTLIST_MATCH at a vehicle exit', () => {
  it('stops a car hotlisted while it was inside', () => {
    const state = gateState({ hotlist: [wantedVin], openVisits: [vehicleVisit()] });
    expect(evaluateVehicleExit(exit(), state, config)).toEqual([{ code: 'HOTLIST_MATCH', severity: 'red', hotlistEntryId: 'hot-vin' }]);
  });

  it('comes before the driver rules', () => {
    const state = gateState({ hotlist: [wantedPerson], openVisits: [vehicleVisit({ driverKey: 'person-b' })] });
    expect(codes(evaluateVehicleExit(exit(), state, config))).toEqual(['HOTLIST_MATCH', 'UNKNOWN_DRIVER']);
  });
});

describe('HOTLIST_MATCH on foot', () => {
  it('stops a hotlisted person walking in', () => {
    const state = gateState({ hotlist: [{ ...wantedPerson, key: 'person-walker' }] });
    expect(evaluatePedestrianEntry({ at: NOW, personKey: 'person-walker' }, state, config)).toEqual([
      { code: 'HOTLIST_MATCH', severity: 'red', hotlistEntryId: 'hot-person' },
    ]);
  });

  it('stops a hotlisted person walking out, and says nothing else about a visit that is in order', () => {
    const state = gateState({ hotlist: [{ ...wantedPerson, key: 'person-walker' }], openVisits: [pedestrianVisit()] });
    expect(codes(evaluatePedestrianExit({ at: NOW, personKey: 'person-walker' }, state, config))).toEqual(['HOTLIST_MATCH']);
  });

  it('still says a person had no entry record', () => {
    const state = gateState({ hotlist: [{ ...wantedPerson, key: 'person-walker' }] });
    expect(codes(evaluatePedestrianExit({ at: NOW, personKey: 'person-walker' }, state, config))).toEqual(['HOTLIST_MATCH', 'PEDESTRIAN_NO_ENTRY']);
  });

  it('does not stop a walker whose car is the hotlisted thing', () => {
    const state = gateState({ hotlist: [wantedPlate], openVisits: [pedestrianVisit()] });
    expect(evaluatePedestrianExit({ at: NOW, personKey: 'person-walker' }, state, config)).toEqual([]);
  });
});
