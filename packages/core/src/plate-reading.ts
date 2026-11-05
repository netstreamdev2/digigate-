/**
 * Reading a number plate off a photo. The camera's text reader returns every line it can see: the plate, the province
 * strip, a dealer's sticker. This picks out what looks like the plate, best first, for the guard to confirm. A reading
 * is never trusted on its own: the guard sees the photo beside it and can retake it or type the plate, and the photo
 * is kept with the check either way.
 */

import { normaliseIdentifier } from './identifiers';

/** One line of text the reader found, with how tall it stood in the photo: a plate's letters are the biggest there. */
export type ReadLine = { text: string; height: number };

const SHORTEST_PLATE = 4;
const LONGEST_PLATE = 10;
/** Two lines this close in height can be the two rows of one square plate. */
const SAME_ROW_HEIGHT = 0.25;
const MOST_READINGS = 3;

// Words printed on plates around the registration, never part of it. Province codes (GP, ZN, NW...) are part of it.
const PLATE_WORDS = new Set([
  'SOUTH', 'AFRICA', 'RSA', 'ZA', 'GAUTENG', 'KWAZULU', 'NATAL', 'KWAZULUNATAL', 'WESTERN', 'EASTERN', 'NORTHERN', 'CAPE',
  'FREE', 'STATE', 'NORTH', 'WEST', 'MPUMALANGA', 'LIMPOPO', 'PROVINCE', 'ONLINE',
]);

// South Africa's plate layouts, from most to least distinctive. A reading in one of them is almost certainly the plate.
const LAYOUTS: readonly RegExp[] = [
  /^[A-Z]{2}\d{2}[A-Z]{2}GP$/, // Gauteng: AB 12 CD GP
  /^[A-Z]{3}\d{3}(GP|MP|NW|FS|EC|NC|L)$/, // ABC 123 GP, ABC 123 L
  /^C[A-Z]{1,2}\d{3,6}$/, // Western Cape: CA 123-456, CAW 12345
  /^N[A-Z]{1,2}\d{3,6}$/, // KwaZulu-Natal: ND 123-456
  /^[A-Z]{3}\d{3}[A-Z]{2}$/, // Other provinces' older plates
];
/** A personalised plate: up to seven of the owner's own characters, then the province. */
const PERSONALISED = /^[A-Z0-9]{1,7}(GP|MP|NW|FS|EC|NC|L|ZN|WP)$/;

const hasLetter = (value: string) => /[A-Z]/.test(value);
const hasDigit = (value: string) => /\d/.test(value);

/** The line with the plate's own words taken out, as one run of letters and digits. */
function registrationIn(text: string): string {
  return text
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word && !PLATE_WORDS.has(word))
    .join('');
}

function layoutScore(reading: string): number {
  if (LAYOUTS.some((layout) => layout.test(reading))) return 2;
  return PERSONALISED.test(reading) ? 1 : 0;
}

function plausible(reading: string): boolean {
  if (reading.length < SHORTEST_PLATE || reading.length > LONGEST_PLATE || !hasLetter(reading)) return false;
  return hasDigit(reading) || PERSONALISED.test(reading);
}

/** The likeliest plates in what the reader found, best first, at most three. Empty when nothing looks like a plate. */
export function plateReadings(lines: readonly ReadLine[]): string[] {
  const candidates: { reading: string; height: number }[] = [];
  lines.forEach((line, index) => {
    const reading = registrationIn(line.text);
    candidates.push({ reading, height: line.height });
    // A square plate puts its registration on two rows of the same size. Joined, they must make a plate layout:
    // any two lines of text can otherwise look like a plate.
    const next = lines[index + 1];
    const joined = next ? reading + registrationIn(next.text) : '';
    if (next && line.height > 0 && Math.abs(next.height - line.height) / line.height <= SAME_ROW_HEIGHT && layoutScore(joined) > 0) {
      candidates.push({ reading: joined, height: Math.min(line.height, next.height) });
    }
  });

  const ranked = candidates
    .filter((candidate) => plausible(candidate.reading))
    .sort((first, second) => layoutScore(second.reading) - layoutScore(first.reading) || second.height - first.height);
  return [...new Set(ranked.map((candidate) => candidate.reading))].slice(0, MOST_READINGS);
}

/** One character of a plate, marked when it isn't the same as the other plate's character in that place. */
export type PlateCharacter = { character: string; differs: boolean };

/**
 * A plate character by character against another, so a one-letter slip (S for C) stands out. Null when the two are
 * different lengths, where a character-by-character comparison would mislead.
 */
export function plateDifferences(plate: string, other: string): PlateCharacter[] | null {
  const shown = normaliseIdentifier(plate);
  const against = normaliseIdentifier(other);
  if (shown.length !== against.length) return null;
  return [...shown].map((character, index) => ({ character, differs: character !== against[index] }));
}
