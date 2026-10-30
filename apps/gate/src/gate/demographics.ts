import { ageBand, type GateEventPayload, type IsoDate } from '@digigate/core';

import { siteConfig } from '@/site/site-config';

/**
 * Sex and age band of a scanned person, for anonymous reports. Only people whose document was scanned have these:
 * passengers are a head count, so reports cover drivers and walk-ins, never everyone in a car.
 */
export function demographicsPayload(sex: 'male' | 'female' | null, birthDate: IsoDate | null, at: number): GateEventPayload {
  return { sex, age_band: birthDate ? ageBand(birthDate, at, siteConfig.rules.utcOffsetMinutes) : null };
}
