import { normaliseIdentifier } from '../identifiers';
import { hit } from './hits';
import type { HotlistEntry, PersonKey, RuleHit } from './types';

/** Who and what a check is about, as the hotlist compares it: every person scanned, and every plate and VIN seen. */
export type HotlistSubject = {
  personKeys: readonly PersonKey[];
  plates: readonly string[];
  vins: readonly string[];
};

const comparable = (values: readonly string[]) => values.map(normaliseIdentifier).filter((value) => value !== '');

/**
 * The first hotlist entry this check is about. A person matches by their key, so the same ID number is caught on a
 * licence or a smart ID card. A car matches by any plate seen, on the disc or read off the car, so a cloned plate is
 * caught either way, or by its VIN. An entry with nothing to match never matches anything.
 */
export function hotlistEntryFor(subject: HotlistSubject, hotlist: readonly HotlistEntry[]): HotlistEntry | undefined {
  const plates = comparable(subject.plates);
  const vins = comparable(subject.vins);
  return hotlist.find((entry) => {
    if (entry.kind === 'person') return entry.key !== '' && subject.personKeys.includes(entry.key);
    const key = normaliseIdentifier(entry.key);
    if (key === '') return false;
    return entry.kind === 'plate' ? plates.includes(key) : vins.includes(key);
  });
}

/** HOTLIST_MATCH, pointing at the entry so the guard sees what the company asked them to do. */
export function hotlistHit(subject: HotlistSubject, hotlist: readonly HotlistEntry[]): RuleHit | undefined {
  const entry = hotlistEntryFor(subject, hotlist);
  return entry ? { ...hit('HOTLIST_MATCH'), hotlistEntryId: entry.id } : undefined;
}
