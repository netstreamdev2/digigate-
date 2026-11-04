// A guard's personal record: what the company keeps on file about each guard, and what their ID card shows. The
// dashboard checks it as it's typed and the server checks it again before saving. It is personal information under
// POPIA: none of it goes to handhelds, ID numbers are stored keyed and encrypted, and every view is logged.

import { isValidSaIdNumber } from './documents/sa-id-number';

export type IdType = 'sa_id' | 'passport';

/** PSIRA's grades, E the entry grade and A the highest. */
export const PSIRA_GRADES = ['A', 'B', 'C', 'D', 'E'] as const;
export type PsiraGrade = (typeof PSIRA_GRADES)[number];

export type GuardRecordInput = {
  phone: string;
  homeAddress: string;
  psiraNumber: string;
  psiraGrade: PsiraGrade | '';
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
};

export const GUARD_RECORD_LIMITS = { address: 300, name: 80, relationship: 40 } as const;

const PHONE = /^\+?[0-9 ]{9,16}$/;
const PSIRA_NUMBER = /^\d{6,10}$/;
const PASSPORT = /^[A-Z0-9]{6,20}$/;

export const isPsiraGrade = (value: unknown): value is PsiraGrade => typeof value === 'string' && (PSIRA_GRADES as readonly string[]).includes(value);

/** An ID number as typed, with spaces and dashes gone and letters in capitals. */
export function cleanIdNumber(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** What's wrong with an ID number, or null when it can be saved. SA ID numbers must pass their check digit. */
export function idNumberProblem(type: IdType, value: string): string | null {
  const number = cleanIdNumber(value);
  if (type === 'sa_id') return isValidSaIdNumber(number) ? null : 'That SA ID number isn\'t right. It has 13 digits; check it against their ID.';
  return PASSPORT.test(number) ? null : 'A passport number is 6 to 20 letters and numbers.';
}

/** The last four characters only, for showing an ID number without revealing it. */
export function maskedIdNumber(lastFour: string): string {
  return `•••• •••• ${lastFour}`;
}

/** What's wrong with the rest of the record, field by field. Empty fields are allowed: a record fills in over time. */
export function guardRecordProblem(record: GuardRecordInput): string | null {
  if (record.phone && !PHONE.test(record.phone.trim())) return 'Their phone number should be 10 digits, like 082 123 4567.';
  if (record.homeAddress.length > GUARD_RECORD_LIMITS.address) return 'That address is too long.';
  if (record.psiraNumber && !PSIRA_NUMBER.test(record.psiraNumber.trim())) return 'A PSIRA number is 6 to 10 digits.';
  if (record.psiraGrade && !isPsiraGrade(record.psiraGrade)) return 'Choose a PSIRA grade from A to E.';
  if (record.nextOfKinName.length > GUARD_RECORD_LIMITS.name) return 'That next of kin name is too long.';
  if (record.nextOfKinRelationship.length > GUARD_RECORD_LIMITS.relationship) return 'Keep the relationship short, like Mother.';
  if (record.nextOfKinPhone && !PHONE.test(record.nextOfKinPhone.trim())) return 'The next of kin\'s phone number should be 10 digits.';
  return null;
}

/** What a record is still missing, for the list of guards. */
export function missingFromRecord(record: { photo: boolean; idNumber: boolean; psira: boolean; nextOfKin: boolean; address: boolean }): string[] {
  return [
    record.photo ? null : 'photo',
    record.idNumber ? null : 'ID number',
    record.psira ? null : 'PSIRA',
    record.nextOfKin ? null : 'next of kin',
    record.address ? null : 'address',
  ].filter((item): item is string => item !== null);
}
