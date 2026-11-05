import { describe, expect, it } from 'vitest';

import { expectedStayLabel, isSiteType, occupantReasonsFor, stayMinutesFor, visitTypesFor } from './site-types';

describe('visitTypesFor', () => {
  it("gives a hospital its own visit types, with no host-based ones", () => {
    expect(visitTypesFor('hospital').map((type) => type.code)).toEqual(['visitor', 'staff', 'delivery', 'contractor', 'patient_dropoff', 'emergency']);
  });

  it('gives an estate residents and domestic workers', () => {
    expect(visitTypesFor('estate').map((type) => type.code)).toContain('domestic_worker');
  });

  it("gives an unknown site type none, never another type's", () => {
    expect(visitTypesFor('mine')).toEqual([]);
    expect(isSiteType('mine')).toBe(false);
  });
});

describe('stayMinutesFor', () => {
  it('gives each visit type its expected stay', () => {
    const stays = stayMinutesFor('hospital');
    expect(stays.visitor).toBe(240);
    expect(stays.delivery).toBe(60);
    expect(stays.staff).toBeNull();
  });

  it("lets a site's own settings win", () => {
    expect(stayMinutesFor('hospital', { visitor: 120 }).visitor).toBe(120);
    expect(stayMinutesFor('hospital', { delivery: null }).delivery).toBeNull();
  });

  it('has no stays for an unknown site type', () => {
    expect(stayMinutesFor('mine')).toEqual({});
  });
});

describe('occupantReasonsFor', () => {
  it('offers reasons for a change either way, ending with not sure', () => {
    expect(occupantReasonsFor('hospital', 'fewer')).toContain('Dropped off a patient');
    expect(occupantReasonsFor('hospital', 'more')).toContain('Fetched a patient');
    expect(occupantReasonsFor('estate', 'fewer').at(-1)).toBe('Not sure');
  });

  it('never mentions patients at an estate', () => {
    expect([...occupantReasonsFor('estate', 'fewer'), ...occupantReasonsFor('estate', 'more')].some((reason) => reason.includes('patient'))).toBe(false);
  });
});

describe('expectedStayLabel', () => {
  it('says a stay in words', () => {
    expect(expectedStayLabel(30)).toBe('30 min');
    expect(expectedStayLabel(60)).toBe('1 hour');
    expect(expectedStayLabel(90)).toBe('1.5 hours');
    expect(expectedStayLabel(240)).toBe('4 hours');
    expect(expectedStayLabel(null)).toBe('No limit');
  });
});
