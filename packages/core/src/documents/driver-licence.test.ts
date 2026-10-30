import { describe, expect, it } from 'vitest';

import { decodeDocument } from './decode';
import { decodeDriverLicence, parseDecryptedLicence } from './driver-licence';

// Decryption can only be tested against real cards (we only have the public keys), so these tests build a
// made-up *decrypted* payload in the documented layout and check the parser against it.
const E0 = 0xe0;
const E1 = 0xe1;
// Real blocks start with a fixed pattern; a distinct filler proves the parser skips it rather than reading it.
const BLOCK_PADDING = [0xee, 0xee, 0xee, 0xee, 0xee];
const BLOCK_DATA = 123;
const DATA_LENGTH = 684;
const HEADER_LENGTH = 10;

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

function packNibbles(nibbles: number[]): number[] {
  const padded = nibbles.length % 2 === 0 ? nibbles : [...nibbles, 0];
  const bytes: number[] = [];
  for (let index = 0; index < padded.length; index += 2) bytes.push(((padded[index] ?? 0) << 4) | (padded[index + 1] ?? 0));
  return bytes;
}

const dateNibbles = (iso: string) => Array.from(iso.replace(/-/g, ''), Number);

/** Splits the data into the five 123-byte and one 69-byte RSA blocks, each with its padding in front. */
function withBlockPadding(data: number[]): Uint8Array {
  const plaintext: number[] = [];
  for (let start = 0; start < data.length; start += BLOCK_DATA) plaintext.push(...BLOCK_PADDING, ...data.slice(start, start + BLOCK_DATA));
  return Uint8Array.from(plaintext);
}

function samplePlaintext(options: { prdp?: string; surname?: string; birthDate?: string } = {}): Uint8Array {
  const text = [
    // Vehicle codes: A, B, then the last two slots empty.
    ...ascii('A'), E0, ...ascii('B'), E1, E1,
    ...ascii(options.surname ?? 'TESTPERSON'), E0,
    ...ascii('TP'), options.prdp ? E0 : E1,
    ...(options.prdp ? [...ascii(options.prdp), E0] : []),
    ...ascii('ZA'), E0,
    ...ascii('ZA'), E0,
    // No vehicle restrictions.
    E1, E1, E1, E1,
    ...ascii('LICTEST00001'), E0,
    ...ascii('8001015009087'),
  ];
  const dates = packNibbles([
    // ID number type, then the dates and codes.
    0, 2,
    ...dateNibbles('2010-05-12'), 0xa, 0xa, 0xa,
    1, 0,
    0xa,
    0, 1,
    ...dateNibbles(options.birthDate ?? '1980-01-01'),
    ...dateNibbles('2021-03-15'),
    ...dateNibbles('2026-03-14'),
    0, 2,
  ]);
  const photoLength = DATA_LENGTH - HEADER_LENGTH - text.length - dates.length;
  const photo = [0x57, 0x49, 0x04, ...new Array<number>(photoLength - 3).fill(0)];
  const header = [0, 0, 0, 0, 0, text.length, 0, dates.length, 0x80 | (photoLength >> 8), photoLength & 0xff];
  return withBlockPadding([...header, ...text, ...dates, ...photo]);
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

  it('reads a field that runs past the first block without picking up the block padding', () => {
    const surname = 'TESTPERSON'.repeat(8);
    expect(parseDecryptedLicence(samplePlaintext({ surname }), 2).surname).toBe(surname);
  });

  it('reads the dates by length, so a 1957 birth year packed as byte 57 does not end them early', () => {
    const licence = parseDecryptedLicence(samplePlaintext({ birthDate: '1957-06-15' }), 2);
    expect([licence.birthDate, licence.validFrom, licence.expiresOn, licence.gender]).toEqual(['1957-06-15', '2021-03-15', '2026-03-14', 'female']);
  });

  it('throws on a payload of the wrong length instead of guessing', () => {
    expect(() => parseDecryptedLicence(samplePlaintext().subarray(0, 700), 2)).toThrow();
  });

  it('throws when the section lengths in the header do not add up', () => {
    const plaintext = samplePlaintext();
    // Header byte 5 (the text length) sits after the first block's 5 padding bytes.
    plaintext[BLOCK_PADDING.length + 5] = (plaintext[BLOCK_PADDING.length + 5] ?? 0) + 1;
    expect(() => parseDecryptedLicence(plaintext, 2)).toThrow();
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
