import type { EpochMs, IsoDate } from './types';

const MINUTE_MS = 60_000;

/** The calendar day at the site when `at` happened. */
export function siteDate(at: EpochMs, utcOffsetMinutes: number): IsoDate {
  return new Date(at + utcOffsetMinutes * MINUTE_MS).toISOString().slice(0, 10);
}

/** A document is valid through the whole of its expiry date. */
export function isExpired(expiresOn: IsoDate, at: EpochMs, utcOffsetMinutes: number): boolean {
  return expiresOn < siteDate(at, utcOffsetMinutes);
}

export function minutesBetween(from: EpochMs, to: EpochMs): number {
  return (to - from) / MINUTE_MS;
}
