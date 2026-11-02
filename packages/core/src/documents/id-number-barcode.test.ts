import { describe, expect, it } from 'vitest';

import { decodeDocument } from './decode';
import { factsFromSaIdNumber, idNumberFromBarcode } from './id-number-barcode';

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
// Invented, valid ID numbers: 1 Jan 1980 female citizen, 1 Jan 1980 male citizen, 1 Jan 1980 female resident.
const FEMALE_CITIZEN = '8001014800080';
const MALE_CITIZEN = '8001015800089';
const FEMALE_RESIDENT = '8001014800189';
const NOW = Date.UTC(2026, 9, 29);

describe('idNumberFromBarcode', () => {
  it('reads a barcode that is only a valid 13-digit ID number', () => {
    expect(idNumberFromBarcode(ascii(FEMALE_CITIZEN))).toBe(FEMALE_CITIZEN);
  });

  it('refuses a number with a wrong check digit, the wrong length or other characters', () => {
    expect(idNumberFromBarcode(ascii('8001014800081'))).toBeNull();
    expect(idNumberFromBarcode(ascii('800101480008'))).toBeNull();
    expect(idNumberFromBarcode(ascii('800101480008A'))).toBeNull();
  });

  it('is what decodeDocument reports for such a scan', () => {
    expect(decodeDocument(ascii(MALE_CITIZEN))).toEqual({ kind: 'id-number', idNumber: MALE_CITIZEN });
  });
});

describe('factsFromSaIdNumber', () => {
  it('reads the birth date, gender and citizenship', () => {
    expect(factsFromSaIdNumber(FEMALE_CITIZEN, NOW)).toEqual({ birthDate: '1980-01-01', gender: 'female', citizen: true });
    expect(factsFromSaIdNumber(MALE_CITIZEN, NOW)?.gender).toBe('male');
    expect(factsFromSaIdNumber(FEMALE_RESIDENT, NOW)?.citizen).toBe(false);
  });

  it('puts a two-digit year in this century unless that would be in the future', () => {
    // 05 is 2005; 99 can only be 1999.
    expect(factsFromSaIdNumber(withCheckDigit('050101480008'), NOW)?.birthDate).toBe('2005-01-01');
    expect(factsFromSaIdNumber(withCheckDigit('990101480008'), NOW)?.birthDate).toBe('1999-01-01');
  });

  it('refuses an ID number whose date part is not a real date', () => {
    expect(factsFromSaIdNumber(withCheckDigit('800231480008'), NOW)).toBeNull();
  });
});

/** Appends the Luhn check digit, so the tests can make valid made-up numbers. */
function withCheckDigit(twelve: string): string {
  for (let digit = 0; digit <= 9; digit++) {
    const candidate = `${twelve}${digit}`;
    let sum = 0;
    for (let index = 0; index < 13; index++) {
      let value = Number(candidate[12 - index]);
      if (index % 2 === 1) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      sum += value;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error('no check digit');
}
