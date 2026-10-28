import { describe, expect, it } from 'vitest';

import { uuidv7 } from './ids';

const random = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const NOW = Date.UTC(2026, 9, 28, 8, 0);

describe('uuidv7', () => {
  it('is a well-formed version 7, variant 10 UUID', () => {
    expect(uuidv7(NOW, random)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('starts with the timestamp in milliseconds', () => {
    const id = uuidv7(NOW, random).replace(/-/g, '');
    expect(Number.parseInt(id.slice(0, 12), 16)).toBe(NOW);
  });

  it('sorts by time', () => {
    const earlier = uuidv7(NOW, random);
    const later = uuidv7(NOW + 1, new Uint8Array(10));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('refuses too few random bytes', () => {
    expect(() => uuidv7(NOW, new Uint8Array(4))).toThrow(RangeError);
  });
});
