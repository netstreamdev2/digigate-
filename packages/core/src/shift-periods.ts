// A site's shift periods: what a guard picks when they start a shift, such as Day 06:00 to 18:00. The dashboard sets
// them per site and the handheld receives them on sync. Times are the site's own clock, as HH:MM; a period whose end is
// earlier than its start runs past midnight.

export type ShiftPeriod = { code: string; label: string; start: string; end: string };

export const MAX_SHIFT_PERIODS = 6;
export const MAX_SHIFT_LABEL = 30;

export const DEFAULT_SHIFT_PERIODS: readonly ShiftPeriod[] = [
  { code: 'day', label: 'Day', start: '06:00', end: '18:00' },
  { code: 'night', label: 'Night', start: '18:00', end: '06:00' },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes after midnight, or null for anything that isn't HH:MM. */
export function minuteOfDay(time: string): number | null {
  if (!TIME.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** A code made from the label, so "Early morning" is early-morning. */
export function shiftCodeFor(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'shift'
  );
}

/** How long a period lasts, in minutes, counting past midnight. */
export function shiftLengthMinutes(period: Pick<ShiftPeriod, 'start' | 'end'>): number | null {
  const start = minuteOfDay(period.start);
  const end = minuteOfDay(period.end);
  if (start === null || end === null || start === end) return null;
  return end > start ? end - start : 24 * 60 - start + end;
}

/** What's wrong with a site's periods, in plain words, or null when they're ready to save. */
export function shiftPeriodsProblem(periods: readonly ShiftPeriod[]): string | null {
  if (periods.length === 0) return 'Add at least one shift.';
  if (periods.length > MAX_SHIFT_PERIODS) return `A site can have up to ${MAX_SHIFT_PERIODS} shifts.`;
  const codes = new Set<string>();
  for (const period of periods) {
    const name = period.label.trim();
    if (!name) return 'Give every shift a name, like Day.';
    if (name.length > MAX_SHIFT_LABEL) return `Keep shift names to ${MAX_SHIFT_LABEL} letters.`;
    if (minuteOfDay(period.start) === null || minuteOfDay(period.end) === null) return `Set when ${name} starts and ends.`;
    if (shiftLengthMinutes(period) === null) return `${name} can't start and end at the same time.`;
    if (codes.has(period.code)) return `Two shifts are called ${name}. Give each its own name.`;
    codes.add(period.code);
  }
  return null;
}

/** Periods as they arrive from anywhere, kept only when every field is there and right. */
export function readShiftPeriods(value: unknown): ShiftPeriod[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const { code, label, start, end } = item as Record<string, unknown>;
    if (typeof code !== 'string' || typeof label !== 'string' || typeof start !== 'string' || typeof end !== 'string') return [];
    if (minuteOfDay(start) === null || minuteOfDay(end) === null) return [];
    return [{ code, label, start, end }];
  });
}

/** The period the site's clock is in, to suggest when a shift starts. Falls back to the first. */
export function shiftPeriodAt<T extends Pick<ShiftPeriod, 'start' | 'end'>>(periods: readonly T[], at: number, utcOffsetMinutes: number): T | undefined {
  const local = new Date(at + utcOffsetMinutes * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const inPeriod = (period: T) => {
    const start = minuteOfDay(period.start);
    const end = minuteOfDay(period.end);
    if (start === null || end === null) return false;
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
  };
  return periods.find(inPeriod) ?? periods[0];
}
