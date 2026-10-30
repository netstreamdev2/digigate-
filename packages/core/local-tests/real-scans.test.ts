// Real scans are personal information: they live in the gitignored fixtures.local/ folder and exist only on a
// developer's machine, so these tests skip anywhere else. Every assertion checks shape and consistency rather than
// values, so a failure prints true/false, never anyone's details.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeDocument } from '../src/documents/decode';
import { checkLicence } from '../src/documents/licence-checks';
import { checkSmartId } from '../src/documents/smart-id-checks';

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
const smartIds = scans('smart-id');
const idNumbers = scans('id-number');

describe.skipIf(licences.length === 0)('real driver licence scans', () => {
  it.each(licences)('scan %i decrypts into a consistent licence', (_, bytes) => {
    const decoded = decodeDocument(bytes);
    expect(decoded.kind).toBe('driver-licence');
    if (decoded.kind !== 'driver-licence') return;
    const { licence } = decoded;

    expect(licence.idNumberType).toBe('02');
    expect(/^[A-Z][A-Z' -]*$/.test(licence.surname)).toBe(true);
    expect(/^[A-Z]{1,6}$/.test(licence.initials)).toBe(true);
    expect(licence.vehicleCodes.length > 0 && licence.vehicleCodes.every((code) => VEHICLE_CODE.test(code))).toBe(true);

    // ID check digit, birth date and gender against the ID number, and the validity dates in order.
    const checks = checkLicence(licence);
    expect(Object.values(checks).every((result) => result === true)).toBe(true);
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

describe.skipIf(idNumbers.length === 0)('real ID-number-only scans', () => {
  it.each(idNumbers)('scan %i is read as an ID number, never as unrecognised', (_, bytes) => {
    const decoded = decodeDocument(bytes);
    expect(decoded.kind).toBe('id-number');
  });
});

describe.skipIf(smartIds.length === 0)('real smart ID scans', () => {
  it.each(smartIds)('scan %i parses into a consistent card', (_, bytes) => {
    const decoded = decodeDocument(bytes);
    expect(decoded.kind).toBe('smart-id');
    if (decoded.kind !== 'smart-id') return;
    const { card } = decoded;

    expect(/^[A-Z][A-Z' -]*$/.test(card.surname)).toBe(true);
    expect(card.nationality.length === 3 && card.countryOfBirth.length === 3).toBe(true);
    // ID check digit, birth date, gender and citizenship against the ID number, and issue after birth.
    const checks = checkSmartId(card);
    expect(Object.values(checks).every((result) => result === true)).toBe(true);
  });
});
