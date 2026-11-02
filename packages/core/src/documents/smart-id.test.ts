import { describe, expect, it } from 'vitest';

import { decodeDocument } from './decode';
import { isSmartIdBarcode, parseSmartId } from './smart-id';
import { checkSmartId, smartIdPassesChecks } from './smart-id-checks';

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

// Made-up holder with a valid, invented ID number: born 1 January 1980, female, citizen.
function sample(overrides: Partial<Record<'surname' | 'sex' | 'idNumber' | 'born' | 'status' | 'issued', string>> = {}): string {
  const fields = {
    surname: 'TESTPERSON',
    names: 'TEST SAMPLE',
    sex: 'F',
    nationality: 'RSA',
    idNumber: '8001014800080',
    born: '01 JAN 1980',
    countryOfBirth: 'RSA',
    status: 'CITIZEN',
    issued: '15 MAR 2021',
    securityNumber: '12345',
    cardNumber: '123456789',
    trailing: '0'.repeat(104),
    ...overrides,
  };
  return Object.values(fields).join('|');
}

describe('parseSmartId', () => {
  it('reads the ten documented fields', () => {
    expect(parseSmartId(ascii(sample()))).toEqual({
      ok: true,
      card: {
        surname: 'TESTPERSON',
        names: 'TEST SAMPLE',
        gender: 'female',
        nationality: 'RSA',
        idNumber: '8001014800080',
        birthDate: '1980-01-01',
        countryOfBirth: 'RSA',
        status: 'CITIZEN',
        issuedOn: '2021-03-15',
        securityNumber: '12345',
      },
    });
  });

  it('refuses a date that is not in the card format, instead of guessing', () => {
    expect(parseSmartId(ascii(sample({ born: '1980-01-01' })))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseSmartId(ascii(sample({ issued: '15 XYZ 2021' })))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses an unknown sex code', () => {
    expect(parseSmartId(ascii(sample({ sex: 'X' })))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses a payload with the wrong number of fields', () => {
    expect(parseSmartId(ascii(`${sample()}|EXTRA`))).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('isSmartIdBarcode', () => {
  it('recognises the 12-field layout with an ID number in the fifth field', () => {
    expect(isSmartIdBarcode(ascii(sample()))).toBe(true);
  });

  it('ignores other text with separators', () => {
    expect(isSmartIdBarcode(ascii('a|b|c|d|e|f|g|h|i|j|k|l'))).toBe(false);
    expect(isSmartIdBarcode(ascii('A|B|C'))).toBe(false);
  });
});

describe('decodeDocument', () => {
  it('decodes a smart ID barcode', () => {
    expect(decodeDocument(ascii(sample())).kind).toBe('smart-id');
  });

  it('reports a smart ID barcode it cannot read as unreadable', () => {
    expect(decodeDocument(ascii(sample({ born: '1 JAN 1980' })))).toEqual({ kind: 'unreadable', document: 'smart-id', reason: 'malformed' });
  });
});

describe('checkSmartId', () => {
  const card = (overrides: Parameters<typeof sample>[0] = {}) => {
    const result = parseSmartId(ascii(sample(overrides)));
    if (!result.ok) throw new Error('sample did not parse');
    return result.card;
  };

  it('passes a consistent card', () => {
    expect(smartIdPassesChecks(checkSmartId(card()))).toBe(true);
  });

  it('flags an ID number with a wrong check digit', () => {
    expect(checkSmartId(card({ idNumber: '8001014800081' })).idNumberValid).toBe(false);
  });

  it('flags a birth date or sex that the ID number contradicts', () => {
    expect(checkSmartId(card({ born: '02 JAN 1980' })).birthDateMatchesIdNumber).toBe(false);
    expect(checkSmartId(card({ sex: 'M' })).genderMatchesIdNumber).toBe(false);
  });

  it('flags a citizen card whose ID number is a permanent resident number, and the reverse', () => {
    expect(checkSmartId(card({ idNumber: '8001014800189' })).citizenshipMatchesIdNumber).toBe(false);
    expect(checkSmartId(card({ idNumber: '8001014800189', status: 'PERMANENT RESIDENT' })).citizenshipMatchesIdNumber).toBe(true);
  });

  it('flags a card issued before its holder was born', () => {
    expect(checkSmartId(card({ issued: '01 JAN 1970' })).datesInOrder).toBe(false);
  });
});
