import { describe, expect, it } from 'vitest';

import { cleanIdNumber, guardRecordProblem, idNumberProblem, maskedIdNumber, missingFromRecord, type GuardRecordInput } from './guard-record';

const empty: GuardRecordInput = { phone: '', homeAddress: '', psiraNumber: '', psiraGrade: '', nextOfKinName: '', nextOfKinRelationship: '', nextOfKinPhone: '' };
const full: GuardRecordInput = {
  phone: '082 123 4567',
  homeAddress: '14 Example Street, Pietermaritzburg',
  psiraNumber: '1234567',
  psiraGrade: 'C',
  nextOfKinName: 'Nomsa Example',
  nextOfKinRelationship: 'Mother',
  nextOfKinPhone: '+27 82 765 4321',
};

describe('ID numbers', () => {
  it('takes an SA ID number with spaces or dashes', () => {
    expect(cleanIdNumber('800101 5009 087')).toBe('8001015009087');
    expect(idNumberProblem('sa_id', '800101-5009-087')).toBeNull();
  });

  it('refuses one whose check digit is wrong', () => {
    expect(idNumberProblem('sa_id', '8001015009088')).toMatch(/isn't right/);
    expect(idNumberProblem('sa_id', '80010150090')).toMatch(/isn't right/);
  });

  it('takes a passport number of letters and digits', () => {
    expect(idNumberProblem('passport', 'a1234567')).toBeNull();
    expect(idNumberProblem('passport', 'A1')).toMatch(/6 to 20/);
  });

  it('shows only the last four', () => {
    expect(maskedIdNumber('9087')).toBe('•••• •••• 9087');
  });
});

describe('a guard\'s record', () => {
  it('can be saved part-filled, or in full', () => {
    expect(guardRecordProblem(empty)).toBeNull();
    expect(guardRecordProblem(full)).toBeNull();
  });

  it('checks what is filled in', () => {
    expect(guardRecordProblem({ ...empty, phone: '12' })).toMatch(/phone/);
    expect(guardRecordProblem({ ...empty, psiraNumber: 'PS-12' })).toMatch(/PSIRA number/);
    expect(guardRecordProblem({ ...empty, nextOfKinPhone: 'call me' })).toMatch(/next of kin/);
    expect(guardRecordProblem({ ...empty, homeAddress: 'x'.repeat(301) })).toMatch(/too long/);
  });

  it('lists what is still missing', () => {
    expect(missingFromRecord({ photo: true, idNumber: false, psira: true, nextOfKin: false, address: true })).toEqual(['ID number', 'next of kin']);
    expect(missingFromRecord({ photo: true, idNumber: true, psira: true, nextOfKin: true, address: true })).toEqual([]);
  });
});
