import { describe, expect, it } from 'vitest';

import { englishPart, parseLicenceDisc } from './licence-disc';

// Made-up disc in the real field order. Not a real vehicle.
const SAMPLE =
  '%MVL1CC01%0000%TEST0001%1%DISCTEST0001%TT00TTGP%TST001T%Sedan (closed top) / Sedan (toe-kap)%TOYOTA%COROLLA%White / Wit%TESTVIN0000000001%TESTENG001%2027-01-31%';

const encode = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe('parseLicenceDisc', () => {
  it('reads every field in order', () => {
    expect(parseLicenceDisc(encode(SAMPLE))).toEqual({
      ok: true,
      disc: {
        discNumber: 'DISCTEST0001',
        plate: 'TT00TTGP',
        registerNumber: 'TST001T',
        description: 'Sedan (closed top) / Sedan (toe-kap)',
        make: 'TOYOTA',
        model: 'COROLLA',
        colour: 'White / Wit',
        vin: 'TESTVIN0000000001',
        engineNumber: 'TESTENG001',
        expiresOn: '2027-01-31',
      },
    });
  });

  it('refuses a disc with a field missing', () => {
    expect(parseLicenceDisc(encode(SAMPLE.replace('%TESTENG001', '')))).toEqual({ ok: false, reason: 'wrong-field-count' });
  });

  it('refuses binary data', () => {
    expect(parseLicenceDisc(Uint8Array.from([0x25, 0x00, 0x25]))).toEqual({ ok: false, reason: 'not-text' });
  });

  it('refuses a VIN of the wrong length', () => {
    expect(parseLicenceDisc(encode(SAMPLE.replace('TESTVIN0000000001', 'SHORTVIN')))).toEqual({ ok: false, reason: 'bad-vin' });
  });

  it('refuses an expiry that is not a date', () => {
    expect(parseLicenceDisc(encode(SAMPLE.replace('2027-01-31', '31/01/2027')))).toEqual({ ok: false, reason: 'bad-expiry-date' });
  });
});

describe('englishPart', () => {
  it('takes the English half of a bilingual value', () => {
    expect(englishPart('White / Wit')).toBe('White');
    expect(englishPart('TOYOTA')).toBe('TOYOTA');
  });
});
