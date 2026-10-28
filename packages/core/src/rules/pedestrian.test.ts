import { describe, expect, it } from 'vitest';

import { evaluatePedestrianEntry, evaluatePedestrianExit } from './pedestrian';
import { config, gateState, NOW, pedestrianVisit, vehicleVisit } from './test-builders';

const walker = { at: NOW, personKey: 'person-walker' };

describe('evaluatePedestrianEntry', () => {
  it('lets a new walk-in through', () => {
    expect(evaluatePedestrianEntry(walker, gateState(), config)).toEqual([]);
  });

  it('flags a person already inside on foot', () => {
    const state = gateState({ openVisits: [pedestrianVisit()] });
    expect(evaluatePedestrianEntry(walker, state, config)).toEqual([
      { code: 'PEDESTRIAN_DUPLICATE_ENTRY', severity: 'amber', relatedVisitId: 'visit-on-foot' },
    ]);
  });

  it('flags a driver whose car is still inside', () => {
    const state = gateState({ openVisits: [vehicleVisit({ driverKey: 'person-walker' })] });
    expect(evaluatePedestrianEntry(walker, state, config)).toEqual([
      { code: 'PEDESTRIAN_DUPLICATE_ENTRY', severity: 'amber', relatedVisitId: 'visit-car-a' },
    ]);
  });

  it('does not flag someone who was only a co-driver', () => {
    const state = gateState({ openVisits: [vehicleVisit({ coDriverKeys: ['person-walker'] })] });
    expect(evaluatePedestrianEntry(walker, state, config)).toEqual([]);
  });
});

describe('evaluatePedestrianExit', () => {
  it('lets a walk-in leave', () => {
    expect(evaluatePedestrianExit(walker, gateState({ openVisits: [pedestrianVisit()] }), config)).toEqual([]);
  });

  it('notes a driver leaving on foot while their car stays inside', () => {
    const state = gateState({ openVisits: [vehicleVisit({ driverKey: 'person-walker' })] });
    expect(evaluatePedestrianExit(walker, state, config)).toEqual([
      { code: 'DRIVER_LEFT_ON_FOOT', severity: 'info', relatedVisitId: 'visit-car-a' },
    ]);
  });

  it('flags someone leaving on foot with no entry record', () => {
    expect(evaluatePedestrianExit(walker, gateState(), config)).toEqual([
      { code: 'PEDESTRIAN_NO_ENTRY', severity: 'amber' },
    ]);
  });

  it('lets an authorised co-driver leave on foot', () => {
    const state = gateState({ openVisits: [vehicleVisit({ coDriverKeys: ['person-walker'] })] });
    expect(evaluatePedestrianExit(walker, state, config)).toEqual([]);
  });

  it('respects a switched-off rule', () => {
    expect(evaluatePedestrianExit(walker, gateState(), { ...config, disabledRules: ['PEDESTRIAN_NO_ENTRY'] })).toEqual([]);
  });
});
