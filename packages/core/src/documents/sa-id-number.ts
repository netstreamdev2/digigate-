import type { IsoDate } from '../rules/types';

/** The first six digits of an SA ID number are the holder's birth date as YYMMDD. */
export function idNumberMatchesBirthDate(idNumber: string, birthDate: IsoDate): boolean {
  return idNumber.startsWith(birthDate.slice(2).replace(/-/g, ''));
}

/** The 7th digit encodes gender: 5 to 9 male, 0 to 4 female. */
export function idNumberMatchesGender(idNumber: string, gender: 'male' | 'female'): boolean {
  return Number(idNumber[6]) >= 5 === (gender === 'male');
}

/** The 11th digit is 0 for a South African citizen, 1 for a permanent resident. */
export function idNumberSaysCitizen(idNumber: string): boolean {
  return idNumber[10] === '0';
}

/** A 13-digit South African ID number with a valid Luhn check digit. Says nothing about whether it was issued. */
export function isValidSaIdNumber(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 13; index++) {
    let digit = Number(value[12 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
