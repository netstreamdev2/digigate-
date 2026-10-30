import { idNumberMatchesBirthDate, idNumberMatchesGender, idNumberSaysCitizen, isValidSaIdNumber } from './sa-id-number';
import type { SmartIdCard } from './smart-id';

/**
 * Consistency checks inside one smart ID barcode. A forged or tampered barcode often fails one. Passing them all
 * does not prove a card is genuine.
 */
export type SmartIdChecks = {
  idNumberValid: boolean;
  birthDateMatchesIdNumber: boolean;
  genderMatchesIdNumber: boolean;
  citizenshipMatchesIdNumber: boolean;
  datesInOrder: boolean;
};

export function checkSmartId(card: SmartIdCard): SmartIdChecks {
  return {
    idNumberValid: isValidSaIdNumber(card.idNumber),
    birthDateMatchesIdNumber: idNumberMatchesBirthDate(card.idNumber, card.birthDate),
    genderMatchesIdNumber: idNumberMatchesGender(card.idNumber, card.gender),
    citizenshipMatchesIdNumber: (card.status === 'CITIZEN') === idNumberSaysCitizen(card.idNumber),
    datesInOrder: card.birthDate < card.issuedOn,
  };
}

export function smartIdPassesChecks(checks: SmartIdChecks): boolean {
  return Object.values(checks).every(Boolean);
}
