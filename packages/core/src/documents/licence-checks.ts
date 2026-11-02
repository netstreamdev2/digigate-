import type { DriverLicence } from './driver-licence';
import { idNumberMatchesBirthDate, idNumberMatchesGender, isValidSaIdNumber } from './sa-id-number';

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

  return {
    idNumberValid: saId ? isValidSaIdNumber(licence.idNumber) : null,
    birthDateMatchesIdNumber: saId && licence.birthDate ? idNumberMatchesBirthDate(licence.idNumber, licence.birthDate) : null,
    genderMatchesIdNumber: saId && licence.gender ? idNumberMatchesGender(licence.idNumber, licence.gender) : null,
    datesInOrder: licence.validFrom && licence.expiresOn ? licence.validFrom < licence.expiresOn : null,
  };
}

/** True when no check that applies has failed. */
export function licencePassesChecks(checks: LicenceChecks): boolean {
  return Object.values(checks).every((result) => result !== false);
}
