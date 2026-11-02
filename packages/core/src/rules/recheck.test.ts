import { describe, expect, it } from 'vitest';

import { missedHits, recheck, reportedCodes, SITE_RULE_DEFAULTS } from './recheck';
import { carA, gateState, NOW, pedestrianVisit, vehicleVisit } from './test-builders';

const vehiclePayload = { vin: carA.vin, plate: carA.plate, disc_number: carA.discNumber, disc_expires_on: carA.expiresOn };

describe('recheck', () => {
  it('finds what a handheld at another gate could not see', () => {
    // The car came in at another gate, with another driver, and that gate's handheld synced first.
    const state = gateState({ openVisits: [vehicleVisit({ driverKey: 'person-b' })] });
    const hits = recheck(
      { type: 'vehicle_exit', occurredAt: NOW, payload: { vehicle: vehiclePayload, driver: { person_key: 'person-a' }, typed_plate: carA.plate, occupants: 2, exit_checks: { ignition_restart: 'done', boot_check: 'not-needed' } } },
      state,
      SITE_RULE_DEFAULTS,
    );
    expect(hits?.map((hit) => hit.code)).toEqual(['UNKNOWN_DRIVER']);
  });

  it('runs the entry rules', () => {
    const state = gateState({ openVisits: [pedestrianVisit({ personKey: 'person-a' })] });
    const hits = recheck({ type: 'vehicle_entry', occurredAt: NOW, payload: { vehicle: vehiclePayload, driver: { person_key: 'person-a', licence_expires_on: '2029-08-14' }, typed_plate: carA.plate } }, state, SITE_RULE_DEFAULTS);
    expect(hits?.map((hit) => hit.code)).toEqual(['DRIVER_ALREADY_ON_SITE']);
  });

  it('runs the walk-in rules', () => {
    const state = gateState({ openVisits: [pedestrianVisit({ personKey: 'person-a' })] });
    expect(recheck({ type: 'pedestrian_entry', occurredAt: NOW, payload: { person: { person_key: 'person-a' } } }, state, SITE_RULE_DEFAULTS)?.map((hit) => hit.code)).toEqual(['PEDESTRIAN_DUPLICATE_ENTRY']);
  });

  it('reads a failed ignition check from the payload', () => {
    const state = gateState({ openVisits: [vehicleVisit()] });
    const hits = recheck({ type: 'vehicle_exit', occurredAt: NOW, payload: { vehicle: vehiclePayload, driver: { person_key: 'person-a' }, typed_plate: carA.plate, occupants: 2, exit_checks: { ignition_restart: 'failed' } } }, state, SITE_RULE_DEFAULTS);
    expect(hits?.map((hit) => hit.code)).toEqual(['IGNITION_RESTART_FAILED']);
  });

  it('leaves alone what is not a check, or a payload it cannot read', () => {
    expect(recheck({ type: 'shift_start', occurredAt: NOW, payload: {} }, gateState(), SITE_RULE_DEFAULTS)).toBeNull();
    expect(recheck({ type: 'vehicle_entry', occurredAt: NOW, payload: { vehicle: vehiclePayload } }, gateState(), SITE_RULE_DEFAULTS)).toBeNull();
    expect(recheck({ type: 'pedestrian_exit', occurredAt: NOW, payload: 'nonsense' }, gateState(), SITE_RULE_DEFAULTS)).toBeNull();
  });
});

describe('missedHits', () => {
  it('keeps only what the handheld did not report', () => {
    const payload = { hits: [{ code: 'NO_ENTRY_RECORD', severity: 'red' }, { code: 7 }] };
    const server = [
      { code: 'NO_ENTRY_RECORD' as const, severity: 'red' as const },
      { code: 'UNKNOWN_DRIVER' as const, severity: 'red' as const },
    ];
    expect(reportedCodes(payload)).toEqual(['NO_ENTRY_RECORD']);
    expect(missedHits(server, reportedCodes(payload)).map((hit) => hit.code)).toEqual(['UNKNOWN_DRIVER']);
  });
});
