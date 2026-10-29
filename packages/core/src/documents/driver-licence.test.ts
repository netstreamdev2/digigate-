import { describe, expect, it } from 'vitest';

import { decodeDocument } from './decode';
import { decodeDriverLicence, parseDecryptedLicence } from './driver-licence';

// Decryption can only be tested against real cards (we only have the public keys), so these tests build a
// made-up *decrypted* payload in the documented layout and check the parser against it.
const E0 = 0xe0;
const E1 = 0xe1;

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

function packNibbles(nibbles: number[]): number[] {
  const padded = nibbles.length % 2 === 0 ? nibbles : [...nibbles, 0];
  const bytes: number[] = [];
  for (let index = 0; index < padded.length; index += 2) bytes.push(((padded[index] ?? 0) << 4) | (padded[index + 1] ?? 0));
  return bytes;
}

const dateNibbles = (iso: string) => Array.from(iso.replace(/-/g, ''), Number);

function samplePlaintext(options: { prdp?: string } = {}): Uint8Array {
  const strings = [
    // Vehicle codes: A, B, then the last two slots empty.
    ...ascii('A'), E0, ...ascii('B'), E1, E1,
    ...ascii('TESTPERSON'), E0,
    ...ascii('TP'), options.prdp ? E0 : E1,
    ...(options.prdp ? [...ascii(options.prdp), E0] : []),
    ...ascii('ZA'), E0,
    ...ascii('ZA'), E0,
    // No vehicle restrictions.
    E1, E1, E1, E1,
    ...ascii('LICTEST00001'), E0,
    ...ascii('8001015009087'),
    0x02,
  ];
  const nibbles = [
    ...dateNibbles('2010-05-12'), 0xa, 0xa, 0xa,
    1, 0,
    0xa,
    0, 1,
    ...dateNibbles('1980-01-01'),
    ...dateNibbles('2021-03-15'),
    ...dateNibbles('2026-03-14'),
    0, 2,
  ];
  return Uint8Array.from([0x01, 0x02, 0x03, 0x82, 0x5a, ...strings, ...packNibbles(nibbles), 0x57, 0x00, 0x00, 0x00, 0x00]);
}

describe('parseDecryptedLicence', () => {
  it('reads the text fields, ID number and packed dates', () => {
    expect(parseDecryptedLicence(samplePlaintext(), 2)).toEqual({
      keyVersion: 2,
      surname: 'TESTPERSON',
      initials: 'TP',
      idNumber: '8001015009087',
      idNumberType: '02',
      idCountryOfIssue: 'ZA',
      licenceNumber: 'LICTEST00001',
      licenceCountryOfIssue: 'ZA',
      vehicleCodes: ['A', 'B'],
      vehicleRestrictions: [],
      licenceCodeIssueDates: ['2010-05-12'],
      driverRestrictionCodes: '10',
      prdpCode: null,
      prdpExpiresOn: null,
      licenceIssueNumber: '01',
      birthDate: '1980-01-01',
      validFrom: '2021-03-15',
      expiresOn: '2026-03-14',
      gender: 'female',
    });
  });

  it('reads a PrDP code when the initials end with E0', () => {
    expect(parseDecryptedLicence(samplePlaintext({ prdp: 'G' }), 2).prdpCode).toBe('G');
  });

  it('throws on a payload cut short instead of guessing', () => {
    expect(() => parseDecryptedLicence(samplePlaintext().subarray(0, 40), 2)).toThrow();
  });

  it('throws when there is no section marker', () => {
    expect(() => parseDecryptedLicence(Uint8Array.from([0x01, 0x02, 0x03]), 2)).toThrow();
  });
});

describe('decodeDriverLicence', () => {
  it('needs exactly 720 bytes', () => {
    expect(decodeDriverLicence(new Uint8Array(100))).toEqual({ ok: false, reason: 'wrong-length' });
  });

  it('refuses an unknown key version', () => {
    expect(decodeDriverLicence(new Uint8Array(720))).toEqual({ ok: false, reason: 'unknown-key-version' });
  });
});

describe('decodeDocument', () => {
  it('recognises a licence disc by its leading %', () => {
    expect(decodeDocument(Uint8Array.from(ascii('%broken%'))).kind).toBe('unreadable');
  });

  it('reports anything else as unrecognised', () => {
    expect(decodeDocument(Uint8Array.from([0x30, 0x31])).kind).toBe('unrecognised');
  });
});
