import { describe, expect, it } from 'vitest';

import { isValidSaIdNumber } from './sa-id-number';

describe('isValidSaIdNumber', () => {
  it('accepts the well-known sample number', () => {
    expect(isValidSaIdNumber('8001015009087')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidSaIdNumber('8001015009088')).toBe(false);
  });

  it('rejects the wrong length or non-digits', () => {
    expect(isValidSaIdNumber('800101500908')).toBe(false);
    expect(isValidSaIdNumber('80010150090A7')).toBe(false);
  });
});
