// South African smart ID card: the PDF417 on the back is plain text, 12 fields separated by "|". The first ten
// follow the order Wikipedia gives (South African identity card) and were checked against a real card on
// 2026-10-29. The last two (a 9-digit and a 104-digit number) are not documented anywhere we found, so they are
// checked for shape but not read. The barcode holds no photo; that is only on the card's chip.
import type { IsoDate } from '../rules/types';

import { bytesToText } from './bytes';

const FIELD_COUNT = 12;
const SEPARATOR = 0x7c;
const LICENCE_BARCODE_LENGTH = 720;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export type SmartIdCard = {
  surname: string;
  names: string;
  gender: 'male' | 'female';
  nationality: string;
  idNumber: string;
  birthDate: IsoDate;
  countryOfBirth: string;
  /** As printed, e.g. CITIZEN. */
  status: string;
  issuedOn: IsoDate;
  securityNumber: string;
};

export type SmartIdResult = { ok: true; card: SmartIdCard } | { ok: false; reason: 'malformed' };

/** Text with exactly 11 separators whose fifth field is a 13-digit number. */
export function isSmartIdBarcode(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes.length >= LICENCE_BARCODE_LENGTH) return false;
  if (bytes.reduce((count, byte) => (byte === SEPARATOR ? count + 1 : count), 0) !== FIELD_COUNT - 1) return false;
  return /^\d{13}$/.test(bytesToText(bytes).split('|')[4] ?? '');
}

/** "01 JAN 1980" as an ISO date, or null if it isn't a real date in that form. */
function parseDate(value: string): IsoDate | null {
  const match = /^(\d{2}) ([A-Z]{3}) (\d{4})$/.exec(value);
  if (!match) return null;
  const [, day = '', monthName = '', year = ''] = match;
  const month = MONTHS.indexOf(monthName) + 1;
  if (month === 0 || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${day}`;
}

const NAME = /^[^\x00-\x1f]+$/;
const LETTERS = /^[A-Z]+( [A-Z]+)*$/;
const COUNTRY = /^[A-Z]{3}$/;
const DIGITS = /^\d+$/;

export function parseSmartId(bytes: Uint8Array): SmartIdResult {
  const fields = bytesToText(bytes).split('|');
  if (fields.length !== FIELD_COUNT) return { ok: false, reason: 'malformed' };
  const [surname = '', names = '', sex = '', nationality = '', idNumber = '', born = '', countryOfBirth = '', status = '', issued = '', securityNumber = '', ...undocumented] = fields;
  const birthDate = parseDate(born);
  const issuedOn = parseDate(issued);

  const wellFormed =
    NAME.test(surname) &&
    NAME.test(names) &&
    (sex === 'M' || sex === 'F') &&
    COUNTRY.test(nationality) &&
    /^\d{13}$/.test(idNumber) &&
    COUNTRY.test(countryOfBirth) &&
    LETTERS.test(status) &&
    /^\d{5}$/.test(securityNumber) &&
    undocumented.every((value) => DIGITS.test(value));
  if (!wellFormed || !birthDate || !issuedOn) return { ok: false, reason: 'malformed' };

  return {
    ok: true,
    card: { surname, names, gender: sex === 'M' ? 'male' : 'female', nationality, idNumber, birthDate, countryOfBirth, status, issuedOn, securityNumber },
  };
}
