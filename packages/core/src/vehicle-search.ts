/**
 * A search for cars the way people describe them: "white hatchback", "blue Mercedes", "silver bakkie". Each word must
 * match, in any of the searched fields, and each word also matches the words a licence disc uses for the same thing
 * (a disc says "Station wagon" where people say SUV, and "LDV" for a bakkie).
 */

const MOST_TERMS = 6;

// Everyday words and the disc's own words for the same thing, in English and Afrikaans as discs print them.
const SAME_THING: readonly (readonly string[])[] = [
  ['suv', 'station wagon', 'stasiewa', 'sports utility'],
  ['hatchback', 'hatch back', 'hatch', 'luikrug'],
  ['sedan', 'saloon', 'toe-kap'],
  ['bakkie', 'ldv', 'pick-up', 'pickup', 'light delivery'],
  ['van', 'panel van', 'minibus'],
  ['coupe', 'coupé'],
  ['convertible', 'cabriolet'],
  ['motorbike', 'motorcycle', 'motor cycle'],
  ['truck', 'lorry', 'goods vehicle'],
  ['grey', 'gray'],
  ['mercedes', 'mercedes-benz', 'benz'],
  ['vw', 'volkswagen'],
  ['chev', 'chevrolet'],
];

/**
 * The search as terms that must all match, each with the ways it can match. Lowercase, at most six terms, and empty
 * for an empty search.
 */
export function vehicleSearchTerms(query: string): string[][] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((word) => word.length > 0);
  const unique = [...new Set(words)].slice(0, MOST_TERMS);
  return unique.map((word) => {
    const group = SAME_THING.find((names) => names.includes(word));
    // A plate typed with its dash (123-456) also finds it stored without one.
    const undashed = word.replace(/-/g, '');
    const own = undashed && undashed !== word ? [word, undashed] : [word];
    return group ? [...own, ...group.filter((name) => !own.includes(name))] : own;
  });
}
