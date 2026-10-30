import { describe, expect, it } from 'vitest';

import { ageBand } from './demographics';

const SAST = 120;
const at = (iso: string) => Date.parse(iso);

describe('ageBand', () => {
  it('puts an age in its band', () => {
    expect(ageBand('1990-06-15', at('2026-10-30T10:00:00Z'), SAST)).toBe('35-44');
  });

  it('counts a birthday only once it has arrived', () => {
    expect(ageBand('2008-10-31', at('2026-10-30T10:00:00Z'), SAST)).toBe('under-18');
    expect(ageBand('2008-10-30', at('2026-10-30T10:00:00Z'), SAST)).toBe('18-24');
  });

  it('uses the calendar day at the site, not in UTC', () => {
    // 22:30 UTC on the 29th is already the 30th in South Africa.
    expect(ageBand('2008-10-30', at('2026-10-29T22:30:00Z'), SAST)).toBe('18-24');
  });

  it('has an open-ended top band', () => {
    expect(ageBand('1950-01-01', at('2026-10-30T10:00:00Z'), SAST)).toBe('65-plus');
  });

  it('refuses a birth date in the future', () => {
    expect(ageBand('2030-01-01', at('2026-10-30T10:00:00Z'), SAST)).toBeNull();
  });
});
