import { describe, expect, it } from 'vitest';

import { vehicleSearchTerms } from './vehicle-search';

describe('vehicleSearchTerms', () => {
  it('makes every word a term that must match', () => {
    expect(vehicleSearchTerms('White Toyota')).toEqual([['white'], ['toyota']]);
  });

  it('matches the words a licence disc uses for the same body', () => {
    const [colour, body] = vehicleSearchTerms('white SUV');
    expect(colour).toEqual(['white']);
    expect(body).toContain('station wagon');
    expect(body?.[0]).toBe('suv');
  });

  it('knows a hatchback, a bakkie and a Mercedes by their other names', () => {
    expect(vehicleSearchTerms('hatchback')[0]).toContain('hatch back');
    expect(vehicleSearchTerms('bakkie')[0]).toContain('ldv');
    expect(vehicleSearchTerms('blue mercedes')[1]).toContain('mercedes-benz');
  });

  it('drops repeats and punctuation, and keeps at most six terms', () => {
    expect(vehicleSearchTerms('white, white!')).toEqual([['white']]);
    expect(vehicleSearchTerms('a b c d e f g h')).toHaveLength(6);
  });

  it('is empty for an empty search', () => {
    expect(vehicleSearchTerms('   ')).toEqual([]);
  });
});

describe('vehicleSearchTerms with names and plates', () => {
  it('keeps apostrophes and accents in names', () => {
    expect(vehicleSearchTerms("O'Brien Zoë")).toEqual([["o'brien"], ['zoë']]);
  });

  it('finds a plate typed with its dash stored without one', () => {
    expect(vehicleSearchTerms('CA 123-456')).toEqual([['ca'], ['123-456', '123456']]);
  });
});
