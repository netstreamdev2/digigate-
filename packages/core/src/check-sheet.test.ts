import { describe, expect, it } from 'vitest';

import { isCheckTask, passengersOf, sheetFileName, sheetSummary, type SheetLine } from './check-sheet';

const line = (overrides: Partial<SheetLine>): SheetLine => ({ task: 'vehicle_entry', visitType: 'visitor', personRef: 'a', occupants: 1, ...overrides });

describe('passengersOf', () => {
  it('counts everyone in the car but the driver', () => {
    expect(passengersOf(line({ occupants: 3 }))).toBe(2);
    expect(passengersOf(line({ occupants: 1 }))).toBe(0);
  });

  it('gives none for someone on foot, a missing count or a nonsense one', () => {
    expect(passengersOf(line({ task: 'pedestrian_entry', occupants: 4 }))).toBe(0);
    expect(passengersOf(line({ occupants: null }))).toBe(0);
    expect(passengersOf(line({ occupants: 0 }))).toBe(0);
    expect(passengersOf(line({ occupants: Number.NaN }))).toBe(0);
  });
});

describe('sheetSummary', () => {
  const lines = [
    line({ personRef: 'a', occupants: 3 }),
    line({ personRef: 'a', task: 'vehicle_exit', occupants: 2 }),
    line({ personRef: 'b', occupants: 1, visitType: 'delivery' }),
    line({ personRef: 'c', task: 'pedestrian_entry', occupants: null, visitType: null }),
    line({ personRef: null, occupants: 2, visitType: '' }),
  ];
  const summary = sheetSummary(lines);

  it('counts each person once, every check, and every passenger', () => {
    expect(summary).toMatchObject({ people: 3, transactions: 5, passengers: 4 });
  });

  it('breaks it down by task, busiest first, leaving out tasks nobody did', () => {
    expect(summary.byTask).toEqual([
      { task: 'vehicle_entry', transactions: 3, people: 2, passengers: 3 },
      { task: 'vehicle_exit', transactions: 1, people: 1, passengers: 1 },
      { task: 'pedestrian_entry', transactions: 1, people: 1, passengers: 0 },
    ]);
  });

  it('breaks it down by visit type, with checks that have none grouped last', () => {
    expect(summary.byType).toEqual([
      { type: 'visitor', people: 1, transactions: 2 },
      { type: 'delivery', people: 1, transactions: 1 },
      { type: null, people: 1, transactions: 2 },
    ]);
  });

  it('is all zeros for a quiet day', () => {
    expect(sheetSummary([])).toEqual({ people: 0, transactions: 0, passengers: 0, byTask: [], byType: [] });
  });
});

describe('sheetFileName and isCheckTask', () => {
  it("names the file as the old system did", () => {
    expect(sheetFileName('2026-11-13')).toBe('SecurityChecks-20261113.pdf');
  });

  it('knows the four gate tasks and nothing else', () => {
    expect(isCheckTask('vehicle_exit')).toBe(true);
    expect(isCheckTask('override')).toBe(false);
  });
});
