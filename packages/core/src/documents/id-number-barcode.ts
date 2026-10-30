// A barcode holding nothing but a 13-digit SA ID number: the only barcode in a green ID book, and the small one
// beside the big PDF417 on the back of a smart ID card. It carries no name, so the rest is typed in or rescanned.
import type { IsoDate } from '../rules/types';

import { bytesToText } from './bytes';
import { isValidSaIdNumber } from './sa-id-number';

export function idNumberFromBarcode(bytes: Uint8Array): string | null {
  if (bytes.length !== 13) return null;
  const text = bytesToText(bytes);
  return isValidSaIdNumber(text) ? text : null;
}

export type SaIdNumberFacts = {
  /** The century is inferred: a year that would lie in the future is taken as the 1900s. */
  birthDate: IsoDate;
  gender: 'male' | 'female';
  citizen: boolean;
};

/**
 * What an SA ID number itself says: birth date (YYMMDD), gender (7th digit 5 to 9 male, 0 to 4 female) and
 * citizenship (11th digit 0 citizen, 1 permanent resident). Null if the date part isn't a real date.
 */
export function factsFromSaIdNumber(idNumber: string, now: number): SaIdNumberFacts | null {
  if (!isValidSaIdNumber(idNumber)) return null;
  const yy = Number(idNumber.slice(0, 2));
  const month = Number(idNumber.slice(2, 4));
  const day = Number(idNumber.slice(4, 6));
  const thisYear = new Date(now).getUTCFullYear();
  const year = 2000 + yy > thisYear ? 1900 + yy : 2000 + yy;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    birthDate: `${year}-${idNumber.slice(2, 4)}-${idNumber.slice(4, 6)}`,
    gender: Number(idNumber[6]) >= 5 ? 'male' : 'female',
    citizen: idNumber[10] === '0',
  };
}
