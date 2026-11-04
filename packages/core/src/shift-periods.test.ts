import { describe, expect, it } from 'vitest';

import { DEFAULT_SHIFT_PERIODS, minuteOfDay, readShiftPeriods, shiftCodeFor, shiftLengthMinutes, shiftPeriodAt, shiftPeriodsProblem, type ShiftPeriod } from './shift-periods';

const SAST = 120;
/** A moment at the site's own clock, on an ordinary day. */
const at = (time: string) => Date.parse(`2026-11-03T${time}:00+02:00`);
const period = (label: string, start: string, end: string): ShiftPeriod => ({ code: shiftCodeFor(label), label, start, end });

describe('shift times', () => {
  it('reads HH:MM and nothing else', () => {
    expect(minuteOfDay('05:30')).toBe(330);
    expect(minuteOfDay('23:59')).toBe(1439);
    expect(minuteOfDay('24:00')).toBeNull();
    expect(minuteOfDay('5:30')).toBeNull();
  });

  it('counts a night shift past midnight', () => {
    expect(shiftLengthMinutes({ start: '18:00', end: '06:00' })).toBe(720);
    expect(shiftLengthMinutes({ start: '05:00', end: '08:00' })).toBe(180);
    expect(shiftLengthMinutes({ start: '08:00', end: '08:00' })).toBeNull();
  });

  it('makes a code from the name', () => {
    expect(shiftCodeFor('Early morning')).toBe('early-morning');
    expect(shiftCodeFor('  !! ')).toBe('shift');
  });
});

describe('a site\'s shifts', () => {
  it('accepts the defaults', () => {
    expect(shiftPeriodsProblem(DEFAULT_SHIFT_PERIODS)).toBeNull();
  });

  it('needs at least one, and no more than six', () => {
    expect(shiftPeriodsProblem([])).toMatch(/at least one/);
    expect(shiftPeriodsProblem(Array.from({ length: 7 }, (_, index) => period(`Shift ${index}`, '06:00', '07:00')))).toMatch(/up to 6/);
  });

  it('needs a name, real times, and a length', () => {
    expect(shiftPeriodsProblem([period(' ', '06:00', '18:00')])).toMatch(/name/);
    expect(shiftPeriodsProblem([period('Day', '6am', '18:00')])).toMatch(/starts and ends/);
    expect(shiftPeriodsProblem([period('Day', '06:00', '06:00')])).toMatch(/same time/);
  });

  it('refuses two shifts with one name', () => {
    expect(shiftPeriodsProblem([period('Day', '06:00', '18:00'), period('day', '07:00', '19:00')])).toMatch(/Two shifts/);
  });

  it('keeps only well-formed periods from outside', () => {
    expect(readShiftPeriods([{ code: 'day', label: 'Day', start: '06:00', end: '18:00' }, { code: 'x', label: 'X', start: 'soon' }, 'nonsense'])).toHaveLength(1);
    expect(readShiftPeriods('nonsense')).toEqual([]);
  });
});

describe('the shift it is now', () => {
  const periods = [period('Early', '05:00', '08:00'), period('Day', '08:00', '18:00'), period('Night', '18:00', '05:00')];

  it('finds the period the site\'s clock is in', () => {
    expect(shiftPeriodAt(periods, at('06:15'), SAST)?.label).toBe('Early');
    expect(shiftPeriodAt(periods, at('08:00'), SAST)?.label).toBe('Day');
  });

  it('finds a night shift on both sides of midnight', () => {
    expect(shiftPeriodAt(periods, at('23:30'), SAST)?.label).toBe('Night');
    expect(shiftPeriodAt(periods, at('02:00'), SAST)?.label).toBe('Night');
  });

  it('falls back to the first when none covers the time', () => {
    expect(shiftPeriodAt([period('Early', '05:00', '08:00')], at('12:00'), SAST)?.label).toBe('Early');
    expect(shiftPeriodAt([], at('12:00'), SAST)).toBeUndefined();
  });
});
