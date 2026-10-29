import { describe, expect, it } from 'vitest';

import type { DriverLicence } from './driver-licence';
import { checkLicence, licencePassesChecks } from './licence-checks';

// Made-up holder. 8001015009087 is the well-known sample ID: born 1980-01-01, gender digit 5 (male).
const licence: DriverLicence = {
  keyVersion: 2,
  surname: 'TESTPERSON',
  initials: 'TP',
  idNumber: '8001015009087',
  idNumberType: '02',
  idCountryOfIssue: 'ZA',
  licenceNumber: 'LICTEST00001',
  licenceCountryOfIssue: 'ZA',
  vehicleCodes: ['B'],
  vehicleRestrictions: [],
  licenceCodeIssueDates: ['2010-05-12'],
  driverRestrictionCodes: '00',
  prdpCode: null,
  prdpExpiresOn: null,
  licenceIssueNumber: '01',
  birthDate: '1980-01-01',
  validFrom: '2021-03-15',
  expiresOn: '2026-03-14',
  gender: 'male',
};

describe('checkLicence', () => {
  it('passes a consistent licence', () => {
    const checks = checkLicence(licence);
    expect(checks).toEqual({
      idNumberValid: true,
      birthDateMatchesIdNumber: true,
      genderMatchesIdNumber: true,
      datesInOrder: true,
    });
    expect(licencePassesChecks(checks)).toBe(true);
  });

  it('catches a birth date that disagrees with the ID number', () => {
    const checks = checkLicence({ ...licence, birthDate: '1981-01-01' });
    expect(checks.birthDateMatchesIdNumber).toBe(false);
    expect(licencePassesChecks(checks)).toBe(false);
  });

  it('catches a gender that disagrees with the ID number', () => {
    expect(checkLicence({ ...licence, gender: 'female' }).genderMatchesIdNumber).toBe(false);
  });

  it('catches a bad ID check digit', () => {
    expect(checkLicence({ ...licence, idNumber: '8001015009088' }).idNumberValid).toBe(false);
  });

  it('catches an expiry before the start date', () => {
    expect(checkLicence({ ...licence, expiresOn: '2020-01-01' }).datesInOrder).toBe(false);
  });

  it('skips the ID checks for a licence issued on a foreign ID', () => {
    const checks = checkLicence({ ...licence, idNumberType: '01', idNumber: 'X1234567890AB' });
    expect(checks.idNumberValid).toBeNull();
    expect(checks.birthDateMatchesIdNumber).toBeNull();
    expect(licencePassesChecks(checks)).toBe(true);
  });
});
