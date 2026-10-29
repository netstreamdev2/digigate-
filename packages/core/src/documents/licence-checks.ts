import type { DriverLicence } from './driver-licence';
import { isValidSaIdNumber } from './sa-id-number';

const SA_ID_NUMBER_TYPE = '02';

/**
 * Consistency checks inside one licence barcode. A forged or tampered barcode often fails one. Passing them all
 * does not prove a card is genuine. `null` means the check doesn't apply, e.g. a licence on a foreign ID.
 */
export type LicenceChecks = {
  idNumberValid: boolean | null;
  birthDateMatchesIdNumber: boolean | null;
  genderMatchesIdNumber: boolean | null;
  datesInOrder: boolean | null;
};

export function checkLicence(licence: DriverLicence): LicenceChecks {
  const saId = licence.idNumberType === SA_ID_NUMBER_TYPE;
  const birthDigits = licence.birthDate?.slice(2).replace(/-/g, '');
  // The 7th digit of an SA ID number encodes gender: 5–9 male, 0–4 female.
  const idSaysMale = Number(licence.idNumber[6]) >= 5;

  return {
    idNumberValid: saId ? isValidSaIdNumber(licence.idNumber) : null,
    birthDateMatchesIdNumber: saId && birthDigits ? licence.idNumber.startsWith(birthDigits) : null,
    genderMatchesIdNumber: saId && licence.gender ? idSaysMale === (licence.gender === 'male') : null,
    datesInOrder: licence.validFrom && licence.expiresOn ? licence.validFrom < licence.expiresOn : null,
  };
}

/** True when no check that applies has failed. */
export function licencePassesChecks(checks: LicenceChecks): boolean {
  return Object.values(checks).every((result) => result !== false);
}
