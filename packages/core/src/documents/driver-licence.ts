// South African driving licence card barcode: 720 bytes = a 6-byte header, five 128-byte RSA blocks and one
// 74-byte RSA block. There is no official specification. The public keys and layout follow the community's
// reverse engineering (github.com/ugommirikwe/sa-license-decoder SPEC.md, ported via the south-africa-driving-license
// Python package); field positions were checked against a real card on 2026-10-29.
//
// Each decrypted block starts with 5 bytes of padding. Without them the data is 684 bytes: a 10-byte header that
// gives the length of each section, then the text fields, the packed dates and the photo.
import type { IsoDate } from '../rules/types';

import { bigIntToBytes, bytesToBigInt, bytesToText } from './bytes';
import { decodeWaveletImage, type PhotoResult } from './licence-photo/wavelet-image';
import { modPow, parseRsaPublicKey, type RsaPublicKey } from './rsa';

const BARCODE_LENGTH = 720;
const HEADER_LENGTH = 6;
const LONG_BLOCK = 128;
const LONG_BLOCK_COUNT = 5;
const SHORT_BLOCK = 74;
const PLAINTEXT_LENGTH = LONG_BLOCK * LONG_BLOCK_COUNT + SHORT_BLOCK;

const BLOCK_PADDING = 5;
const DATA_LENGTH = PLAINTEXT_LENGTH - BLOCK_PADDING * (LONG_BLOCK_COUNT + 1);
const DATA_HEADER_LENGTH = 10;
const TEXT_LENGTH_BYTE = 5;
const DATES_LENGTH_BYTE = 7;
const PHOTO_LENGTH_BYTE = 8;

const FIELD_END = 0xe0;
const GROUP_END = 0xe1;
const EMPTY_DATE_NIBBLE = 0xa;

const KEY_VERSIONS = [
  {
    version: 1,
    header: [0x01, 0xe1, 0x02, 0x45],
    long: `-----BEGIN RSA PUBLIC KEY-----
MIGXAoGBAP7S4cJ+M2MxbncxenpSxUmBOVGGvkl0dgxyUY1j4FRKSNCIszLFsMNwx2XWXZg8H53gpCsxDMwHrncL0rYdak3M6sdXaJvcv2CEePrzEvYIfMSWw3Ys9cRlHK7No0mfrn7bfrQOPhjrMEFw6R7VsVaqzm9DLW7KbMNYUd6MZ49nAhEAu3l//ex/nkLJ1vebE3BZ2w==
-----END RSA PUBLIC KEY-----`,
    short: `-----BEGIN RSA PUBLIC KEY-----
MGACSwD/POxrX0Djw2YUUbn8+u866wbcIynA5vTczJJ5cmcWzhW74F7tLFcRvPj1tsj3J221xDv6owQNwBqxS5xNFvccDOXqlT8MdUxrFwIRANsFuoItmswz+rfY9Cf5zmU=
-----END RSA PUBLIC KEY-----`,
  },
  {
    version: 2,
    header: [0x01, 0x9b, 0x09, 0x45],
    long: `-----BEGIN RSA PUBLIC KEY-----
MIGWAoGBAMqfGO9sPz+kxaRh/qVKsZQGul7NdG1gonSS3KPXTjtcHTFfexA4MkGAmwKeu9XeTRFgMMxX99WmyaFvNzuxSlCFI/foCkx0TZCFZjpKFHLXryxWrkG1Bl9++gKTvTJ4rWk1RvnxYhm3n/Rxo2NoJM/822Oo7YBZ5rmk8NuJU4HLAhAYcJLaZFTOsYU+aRX4RmoF
-----END RSA PUBLIC KEY-----`,
    short: `-----BEGIN RSA PUBLIC KEY-----
MF8CSwC0BKDfEdHKz/GhoEjU1XP5U6YsWD10klknVhpteh4rFAQlJq9wtVBUc5DqbsdI0w/bga20kODDahmGtASy9fae9dobZj5ZUJEw5wIQMJz+2XGf4qXiDJu0R2U4Kw==
-----END RSA PUBLIC KEY-----`,
  },
] as const;

export type LicenceKeyVersion = (typeof KEY_VERSIONS)[number]['version'];

export type DriverLicence = {
  keyVersion: LicenceKeyVersion;
  surname: string;
  initials: string;
  idNumber: string;
  /** `02` is a South African ID number. */
  idNumberType: string;
  idCountryOfIssue: string;
  licenceNumber: string;
  licenceCountryOfIssue: string;
  vehicleCodes: string[];
  vehicleRestrictions: string[];
  licenceCodeIssueDates: IsoDate[];
  /** Two digits, each 0 none, 1 glasses or contact lenses, 2 artificial limb. */
  driverRestrictionCodes: string;
  prdpCode: string | null;
  prdpExpiresOn: IsoDate | null;
  licenceIssueNumber: string;
  birthDate: IsoDate | null;
  validFrom: IsoDate | null;
  expiresOn: IsoDate | null;
  gender: 'male' | 'female' | null;
};

export type DriverLicenceResult =
  | { ok: true; licence: DriverLicence }
  | { ok: false; reason: 'wrong-length' | 'unknown-key-version' | 'malformed' };

class MalformedLicence extends Error {}

const keyCache = new Map<LicenceKeyVersion, { long: RsaPublicKey; short: RsaPublicKey }>();

function keysFor(version: (typeof KEY_VERSIONS)[number]): { long: RsaPublicKey; short: RsaPublicKey } {
  const cached = keyCache.get(version.version);
  if (cached) return cached;
  const keys = { long: parseRsaPublicKey(version.long), short: parseRsaPublicKey(version.short) };
  keyCache.set(version.version, keys);
  return keys;
}

export function isDriverLicenceBarcode(bytes: Uint8Array): boolean {
  return bytes.length === BARCODE_LENGTH && KEY_VERSIONS.some((key) => key.header.every((byte, index) => bytes[index] === byte));
}

function decryptBlock(block: Uint8Array, key: RsaPublicKey): Uint8Array {
  return bigIntToBytes(modPow(bytesToBigInt(block), key.exponent, key.modulus), block.length);
}

/** Decrypts the six RSA blocks. The header is not part of the result. */
export function decryptDriverLicence(bytes: Uint8Array): { keyVersion: LicenceKeyVersion; plaintext: Uint8Array } | null {
  if (bytes.length !== BARCODE_LENGTH) return null;
  const version = KEY_VERSIONS.find((key) => key.header.every((byte, index) => bytes[index] === byte));
  if (!version) return null;

  const keys = keysFor(version);
  const plaintext = new Uint8Array(PLAINTEXT_LENGTH);
  for (let block = 0; block < LONG_BLOCK_COUNT; block++) {
    const start = HEADER_LENGTH + block * LONG_BLOCK;
    plaintext.set(decryptBlock(bytes.subarray(start, start + LONG_BLOCK), keys.long), block * LONG_BLOCK);
  }
  const shortStart = HEADER_LENGTH + LONG_BLOCK * LONG_BLOCK_COUNT;
  plaintext.set(decryptBlock(bytes.subarray(shortStart, shortStart + SHORT_BLOCK), keys.short), LONG_BLOCK * LONG_BLOCK_COUNT);
  return { keyVersion: version.version, plaintext };
}

function byteAt(data: Uint8Array, index: number): number {
  const value = data[index];
  if (value === undefined) throw new MalformedLicence('Ran past the end of the data');
  return value;
}

/** Joins the blocks without the padding each one starts with. */
function stripBlockPadding(plaintext: Uint8Array): Uint8Array {
  if (plaintext.length !== PLAINTEXT_LENGTH) throw new MalformedLicence('Wrong plaintext length');
  const data = new Uint8Array(DATA_LENGTH);
  let written = 0;
  for (let start = 0; start < plaintext.length; start += LONG_BLOCK) {
    const block = plaintext.subarray(start + BLOCK_PADDING, Math.min(start + LONG_BLOCK, plaintext.length));
    data.set(block, written);
    written += block.length;
  }
  return data;
}

type LicenceSections = { text: Uint8Array; dates: Uint8Array; photo: Uint8Array };

/** Cuts the data into its sections using the lengths in the header, which must account for every byte. */
function splitSections(data: Uint8Array): LicenceSections {
  const textLength = byteAt(data, TEXT_LENGTH_BYTE);
  const datesLength = byteAt(data, DATES_LENGTH_BYTE);
  // The upper 4 bits of this 12-bit length are not part of it.
  const photoLength = ((byteAt(data, PHOTO_LENGTH_BYTE) & 0x0f) << 8) | byteAt(data, PHOTO_LENGTH_BYTE + 1);
  if (DATA_HEADER_LENGTH + textLength + datesLength + photoLength !== data.length) throw new MalformedLicence('Section lengths do not add up');

  const datesStart = DATA_HEADER_LENGTH + textLength;
  const photoStart = datesStart + datesLength;
  return { text: data.subarray(DATA_HEADER_LENGTH, datesStart), dates: data.subarray(datesStart, photoStart), photo: data.subarray(photoStart) };
}

class Cursor {
  private position = 0;

  constructor(private readonly data: Uint8Array) {}

  byte(): number {
    const value = byteAt(this.data, this.position);
    this.position += 1;
    return value;
  }

  /** Reads text up to an E0 or E1 marker and reports which one ended it. */
  field(): { value: string; delimiter: number } {
    const bytes: number[] = [];
    for (;;) {
      const byte = this.byte();
      if (byte === FIELD_END || byte === GROUP_END) return { value: bytesToText(Uint8Array.from(bytes)), delimiter: byte };
      bytes.push(byte);
    }
  }

  /** Up to `slots` values. E1 straight after a value means the slot after it is empty. */
  group(slots: number): string[] {
    const values: string[] = [];
    for (let slot = 0; slot < slots; slot++) {
      const { value, delimiter } = this.field();
      if (delimiter === GROUP_END && value !== '') slot++;
      if (value !== '') values.push(value);
    }
    return values;
  }

  text(length: number): string {
    return bytesToText(Uint8Array.from({ length }, () => this.byte()));
  }
}

class Nibbles {
  private readonly values: number[] = [];

  constructor(bytes: Uint8Array) {
    for (const byte of bytes) this.values.push(byte >> 4, byte & 0x0f);
  }

  next(): number {
    const value = this.values.shift();
    if (value === undefined) throw new MalformedLicence('Ran out of nibbles');
    return value;
  }

  digits(count: number): string {
    return Array.from({ length: count }, () => {
      const value = this.next();
      if (value > 9) throw new MalformedLicence('Expected a decimal digit');
      return String(value);
    }).join('');
  }

  /** Eight nibbles YYYYMMDD, or a single A nibble for "no date". */
  date(): IsoDate | null {
    const first = this.next();
    if (first === EMPTY_DATE_NIBBLE) return null;
    if (first > 9) throw new MalformedLicence('Expected a decimal digit');
    const rest = this.digits(7);
    const iso = `${first}${rest.slice(0, 3)}-${rest.slice(3, 5)}-${rest.slice(5, 7)}`;
    const [, month, day] = iso.split('-').map(Number);
    if (!month || month > 12 || !day || day > 31) throw new MalformedLicence('Impossible date');
    return iso;
  }
}

export function parseDecryptedLicence(plaintext: Uint8Array, keyVersion: LicenceKeyVersion): DriverLicence {
  const { text, dates } = splitSections(stripBlockPadding(plaintext));
  const cursor = new Cursor(text);

  const vehicleCodes = cursor.group(4);
  const surname = cursor.field();
  const initials = cursor.field();
  const prdp = initials.delimiter === FIELD_END ? cursor.field().value : null;
  const idCountryOfIssue = cursor.field().value;
  const licenceCountryOfIssue = cursor.field().value;
  const vehicleRestrictions = cursor.group(4);
  const licenceNumber = cursor.field().value;
  const idNumber = cursor.text(13);

  const nibbles = new Nibbles(dates);
  const idNumberType = nibbles.digits(2);
  const licenceCodeIssueDates = Array.from({ length: 4 }, () => nibbles.date()).filter((date): date is IsoDate => date !== null);
  const driverRestrictionCodes = nibbles.digits(2);
  const prdpExpiresOn = nibbles.date();
  const licenceIssueNumber = nibbles.digits(2);
  const birthDate = nibbles.date();
  const validFrom = nibbles.date();
  const expiresOn = nibbles.date();
  const genderCode = nibbles.digits(2);

  return {
    keyVersion,
    surname: surname.value,
    initials: initials.value,
    idNumber,
    idNumberType,
    idCountryOfIssue,
    licenceNumber,
    licenceCountryOfIssue,
    vehicleCodes,
    vehicleRestrictions,
    licenceCodeIssueDates,
    driverRestrictionCodes,
    prdpCode: prdp === '' ? null : prdp,
    prdpExpiresOn,
    licenceIssueNumber,
    birthDate,
    validFrom,
    expiresOn,
    gender: genderCode === '01' ? 'male' : genderCode === '02' ? 'female' : null,
  };
}

export function decodeDriverLicence(bytes: Uint8Array): DriverLicenceResult {
  if (bytes.length !== BARCODE_LENGTH) return { ok: false, reason: 'wrong-length' };
  const decrypted = decryptDriverLicence(bytes);
  if (!decrypted) return { ok: false, reason: 'unknown-key-version' };
  try {
    return { ok: true, licence: parseDecryptedLicence(decrypted.plaintext, decrypted.keyVersion) };
  } catch (error) {
    if (error instanceof MalformedLicence) return { ok: false, reason: 'malformed' };
    throw error;
  }
}

/** The photo section of a decrypted licence, still compressed. */
export function licencePhotoData(plaintext: Uint8Array): Uint8Array | null {
  try {
    return splitSections(stripBlockPadding(plaintext)).photo;
  } catch (error) {
    if (error instanceof MalformedLicence) return null;
    throw error;
  }
}

export type LicencePhotoResult = PhotoResult | { ok: false; reason: 'not-a-licence' };

/**
 * Decodes the photo printed into a licence barcode, for the guard to compare with the driver's face. Kept apart
 * from `decodeDriverLicence` so the scan result never waits on it.
 */
export function decodeLicencePhoto(bytes: Uint8Array): LicencePhotoResult {
  const decrypted = decryptDriverLicence(bytes);
  const photo = decrypted ? licencePhotoData(decrypted.plaintext) : null;
  return photo ? decodeWaveletImage(photo) : { ok: false, reason: 'not-a-licence' };
}
