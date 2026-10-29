// Real scans are personal information: they live in the gitignored fixtures.local/ folder and exist only on a
// developer's machine, so these tests skip anywhere else. Every assertion checks shape and consistency rather than
// values, so a failure prints true/false, never anyone's details.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeDocument } from '../src/documents/decode';
import { isValidSaIdNumber } from '../src/documents/sa-id-number';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures.local');
const VEHICLE_CODE = /^(A1|A|B|C1|C|EB|EC1|EC)$/;

function scans(folder: string): (readonly [number, Uint8Array])[] {
  const directory = join(FIXTURES, folder);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.bin'))
    .map((name, index) => [index + 1, new Uint8Array(readFileSync(join(directory, name)))] as const);
}

const licences = scans('driver-licence');
const discs = scans('licence-disc');

describe.skipIf(licences.length === 0)('real driver licence scans', () => {
  it.each(licences)('scan %i decrypts into a consistent licence', (_, bytes) => {
    const decoded = decodeDocument(bytes);
    expect(decoded.kind).toBe('driver-licence');
    if (decoded.kind !== 'driver-licence') return;
    const { licence } = decoded;

    expect(isValidSaIdNumber(licence.idNumber)).toBe(true);
    expect(licence.idNumberType).toBe('02');
    expect(/^[A-Z][A-Z' -]*$/.test(licence.surname)).toBe(true);
    expect(/^[A-Z]{1,6}$/.test(licence.initials)).toBe(true);
    expect(licence.vehicleCodes.length > 0 && licence.vehicleCodes.every((code) => VEHICLE_CODE.test(code))).toBe(true);
    expect(licence.validFrom !== null && licence.expiresOn !== null && licence.expiresOn > licence.validFrom).toBe(true);

    // The ID number starts with the birth date (YYMMDD) and its 7th digit encodes gender: 5–9 male, 0–4 female.
    const birthDigits = licence.birthDate?.slice(2).replace(/-/g, '') ?? '';
    expect(birthDigits.length === 6 && licence.idNumber.startsWith(birthDigits)).toBe(true);
    expect(licence.gender !== null && (Number(licence.idNumber[6]) >= 5) === (licence.gender === 'male')).toBe(true);
  });
});

describe.skipIf(discs.length === 0)('real licence disc scans', () => {
  it.each(discs)('scan %i parses into a consistent disc', (_, bytes) => {
    const decoded = decodeDocument(bytes);
    expect(decoded.kind).toBe('licence-disc');
    if (decoded.kind !== 'licence-disc') return;
    const { disc } = decoded;

    expect(/^[A-Z0-9]{17}$/.test(disc.vin)).toBe(true);
    expect(/^[A-Z]{3}\d{3}[A-Z]$/.test(disc.registerNumber)).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(disc.expiresOn)).toBe(true);
    expect(disc.make.length > 0 && disc.model.length > 0 && disc.plate.length > 0).toBe(true);
  });
});
