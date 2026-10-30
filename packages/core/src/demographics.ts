import { siteDate } from './rules/dates';
import type { EpochMs, IsoDate } from './rules/types';

/** Bands rather than exact ages, so a report can't single anyone out by their age. */
export type AgeBand = 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65-plus';

const BANDS: readonly { below: number; band: AgeBand }[] = [
  { below: 18, band: 'under-18' },
  { below: 25, band: '18-24' },
  { below: 35, band: '25-34' },
  { below: 45, band: '35-44' },
  { below: 55, band: '45-54' },
  { below: 65, band: '55-64' },
];

/** The age band on the site's calendar day, or null for a birth date that hasn't happened yet. */
export function ageBand(birthDate: IsoDate, at: EpochMs, utcOffsetMinutes: number): AgeBand | null {
  const today = siteDate(at, utcOffsetMinutes);
  if (birthDate > today) return null;
  const hadBirthday = today.slice(5) >= birthDate.slice(5);
  const age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (hadBirthday ? 0 : 1);
  return BANDS.find(({ below }) => age < below)?.band ?? '65-plus';
}
