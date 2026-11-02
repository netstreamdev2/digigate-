import { describe, expect, it } from 'vitest';

import {
  activitySeries,
  averageStay,
  canCompare,
  compactCount,
  countLabel,
  entriesOf,
  hourSeries,
  percentChange,
  periodHeading,
  periodLabel,
  plainLabel,
  reportFileName,
  reportScope,
  reportSubject,
  ruleLines,
  ruleTitle,
  stayLabel,
  type ReportData,
} from './reports';
import { RULE_SEVERITY } from './rules/codes';

const hours = Array.from({ length: 24 }, (_unused, hour) => hour);

function daysFrom(start: string, count: number) {
  return Array.from({ length: count }, (_unused, index) => {
    const day = new Date(`${start}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return { day: day.toISOString().slice(0, 10), checks: index + 1, entries: 1 };
  });
}

const scope = { company: 'Test Guarding', client: null, frequency: 'weekly', from: '2026-10-26', to: '2026-11-01' } satisfies Partial<ReportData>;

describe('report wording', () => {
  it('names each kind of period', () => {
    expect(periodLabel('daily', '2026-11-01', '2026-11-01')).toBe('Sunday 1 November 2026');
    expect(periodLabel('weekly', '2026-10-26', '2026-11-01')).toBe('26 Oct – 1 Nov 2026');
    expect(periodLabel('weekly', '2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(periodLabel('monthly', '2026-10-01', '2026-10-31')).toBe('October 2026');
    expect(periodLabel('quarterly', '2026-10-01', '2026-12-31')).toBe('Q4 2026, Oct – Dec');
    expect(periodLabel('yearly', '2026-01-01', '2026-12-31')).toBe('2026');
  });

  it('says when a period is still running', () => {
    expect(periodHeading({ frequency: 'monthly', from: '2026-11-01', to: '2026-11-30', in_progress: true })).toBe('November 2026, so far');
    expect(periodHeading({ frequency: 'monthly', from: '2026-10-01', to: '2026-10-31' })).toBe('October 2026');
    expect(reportSubject({ ...scope, in_progress: true })).toBe('Test Guarding: Weekly report, 26 Oct – 1 Nov 2026, so far');
  });

  it('only leaves out the comparison for a day still running', () => {
    expect(canCompare({ frequency: 'daily', in_progress: true })).toBe(false);
    expect(canCompare({ frequency: 'daily', in_progress: false })).toBe(true);
    expect(canCompare({ frequency: 'monthly', in_progress: true })).toBe(true);
  });

  it('puts the client first when the report is for one client', () => {
    expect(reportScope({ company: 'Test Guarding', client: 'Test Hospital' })).toBe('Test Hospital');
    expect(reportScope({ company: 'Test Guarding', client: null })).toBe('Test Guarding');
  });

  it('builds the subject and file name', () => {
    expect(reportSubject(scope)).toBe('Test Guarding: Weekly report, 26 Oct – 1 Nov 2026');
    expect(reportFileName(scope)).toBe('digigate-test-guarding-weekly-2026-10-26.pdf');
  });

  it('keeps a file name safe whatever the name holds', () => {
    expect(reportFileName({ ...scope, company: 'Ünï / Co. "Ltd"' })).toBe('digigate-n-co-ltd-weekly-2026-10-26.pdf');
    expect(reportFileName({ ...scope, company: '???' })).toBe('digigate-report-weekly-2026-10-26.pdf');
  });

  it('has a title for every rule', () => {
    for (const code of Object.keys(RULE_SEVERITY)) expect(ruleTitle(code)).not.toBe(code);
  });

  it('adds up rules that share a title, most first', () => {
    const lines = ruleLines([
      { code: 'DISC_EXPIRED', hits: 5 },
      { code: 'NO_ENTRY_RECORD', hits: 4 },
      { code: 'PEDESTRIAN_NO_ENTRY', hits: 3 },
    ]);
    expect(lines).toEqual([
      { label: 'No entry record', value: 7 },
      { label: 'Licence disc expired', value: 5 },
    ]);
  });

  it('falls back to the code for a rule it has not heard of', () => {
    expect(ruleTitle('NEW_RULE')).toBe('NEW_RULE');
  });

  it('turns codes into words', () => {
    expect(plainLabel('patient_dropoff')).toBe('Patient dropoff');
  });
});

describe('report figures', () => {
  it('compares with the period before', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(0, 100)).toBe(-100);
  });

  it('has no change to show when the period before was empty', () => {
    expect(percentChange(50, 0)).toBeNull();
  });

  it('averages stays over exits', () => {
    expect(averageStay({ stay_minutes: 300, exits: 4 })).toBe(75);
    expect(averageStay({ stay_minutes: 0, exits: 0 })).toBe(0);
    expect(averageStay({})).toBe(0);
  });

  it('adds cars and walk-ins into entries', () => {
    expect(entriesOf({ vehicles_in: 3, people_in: 2 })).toBe(5);
    expect(entriesOf({})).toBe(0);
  });

  it('writes stays and counts plainly', () => {
    expect(stayLabel(45)).toBe('45m');
    expect(stayLabel(96)).toBe('1h 36m');
    expect(stayLabel(605)).toBe('10h 05m');
    expect(countLabel(1284)).toBe('1 284');
    expect(compactCount(9999)).toBe('9 999');
    expect(compactCount(12_940)).toBe('12.9K');
    expect(compactCount(120_000)).toBe('120K');
    expect(compactCount(1_250_000)).toBe('1.3M');
  });
});

describe('report series', () => {
  it('shows a day by the hour', () => {
    const series = activitySeries({ frequency: 'daily', days: [], hours });
    expect(series).toHaveLength(24);
    expect(series[7]).toEqual({ label: '07', detail: '07:00 to 08:00', value: 7 });
  });

  it('shows a week by the day', () => {
    const series = activitySeries({ frequency: 'weekly', days: daysFrom('2026-10-26', 7), hours });
    expect(series.map(({ label }) => label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('shows a month by the day', () => {
    const series = activitySeries({ frequency: 'monthly', days: daysFrom('2026-10-01', 31), hours });
    expect(series).toHaveLength(31);
    expect(series[30]?.label).toBe('31');
  });

  it('shows a quarter by the week, and every day counts', () => {
    const days = daysFrom('2026-10-01', 92);
    const series = activitySeries({ frequency: 'quarterly', days, hours });
    expect(series).toHaveLength(14);
    expect(series[0]?.detail).toBe('1 Oct – 7 Oct');
    expect(series.reduce((sum, { value }) => sum + value, 0)).toBe(days.reduce((sum, { checks }) => sum + checks, 0));
  });

  it('shows a year by the month, and every day counts', () => {
    const days = daysFrom('2026-01-01', 365);
    const series = activitySeries({ frequency: 'yearly', days, hours });
    expect(series.map(({ label }) => label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(series.reduce((sum, { value }) => sum + value, 0)).toBe(days.reduce((sum, { checks }) => sum + checks, 0));
  });

  it('gives the busiest hours whatever the period', () => {
    expect(hourSeries({ hours })).toHaveLength(24);
  });
});
