import { describe, expect, it } from 'vitest';

import { expectedVisitorFor, type ExpectedVisitor } from './expected-visitors';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 4, 8, 0);

const booking = (overrides: Partial<ExpectedVisitor> = {}): ExpectedVisitor => ({
  id: 'booked-1',
  name: 'Thandeka Mokoena',
  personKey: 'person-booked',
  plate: null,
  visitType: 'contractor',
  from: NOW - HOUR,
  until: NOW + HOUR,
  ...overrides,
});

describe('expectedVisitorFor', () => {
  it('finds the booking for the person', () => {
    expect(expectedVisitorFor({ personKey: 'person-booked', plates: [] }, NOW, [booking()])?.id).toBe('booked-1');
  });

  it('finds a booking by the car when the driver was not named', () => {
    const byCar = booking({ id: 'booked-car', personKey: null, plate: 'test 123' });
    expect(expectedVisitorFor({ personKey: 'someone-else', plates: ['TEST-123'] }, NOW, [byCar])?.id).toBe('booked-car');
  });

  it("prefers the person's own booking to one for the car", () => {
    const byCar = booking({ id: 'booked-car', personKey: null, plate: 'TEST 123' });
    const byPerson = booking({ id: 'booked-person' });
    expect(expectedVisitorFor({ personKey: 'person-booked', plates: ['TEST 123'] }, NOW, [byCar, byPerson])?.id).toBe('booked-person');
  });

  it('expects nobody before or after the booked days', () => {
    expect(expectedVisitorFor({ personKey: 'person-booked', plates: [] }, NOW + 2 * HOUR, [booking()])).toBeUndefined();
    expect(expectedVisitorFor({ personKey: 'person-booked', plates: [] }, NOW - 2 * HOUR, [booking()])).toBeUndefined();
  });

  it('counts the first and last moment of the window', () => {
    expect(expectedVisitorFor({ personKey: 'person-booked', plates: [] }, NOW + HOUR, [booking()])).toBeDefined();
    expect(expectedVisitorFor({ personKey: 'person-booked', plates: [] }, NOW - HOUR, [booking()])).toBeDefined();
  });

  it('never matches an empty plate', () => {
    const blank = booking({ personKey: null, plate: ' ' });
    expect(expectedVisitorFor({ personKey: 'anyone', plates: [''] }, NOW, [blank])).toBeUndefined();
  });

  it('does not match someone else', () => {
    expect(expectedVisitorFor({ personKey: 'someone-else', plates: ['TEST 999'] }, NOW, [booking()])).toBeUndefined();
  });
});
