import { describe, expect, it } from 'vitest';

import { modPow, parseRsaPublicKey } from './rsa';

// The version 2 key for the 74-byte block, as published by the community decoders.
const SHORT_KEY = `-----BEGIN RSA PUBLIC KEY-----
MF8CSwC0BKDfEdHKz/GhoEjU1XP5U6YsWD10klknVhpteh4rFAQlJq9wtVBUc5DqbsdI0w/bga20kODDahmGtASy9fae9dobZj5ZUJEw5wIQMJz+2XGf4qXiDJu0R2U4Kw==
-----END RSA PUBLIC KEY-----`;

describe('modPow', () => {
  it('matches a worked example', () => {
    expect(modPow(4n, 13n, 497n)).toBe(445n);
  });

  it('handles an exponent of zero', () => {
    expect(modPow(7n, 0n, 13n)).toBe(1n);
  });
});

describe('parseRsaPublicKey', () => {
  it('reads the modulus and exponent of a PKCS#1 key', () => {
    const key = parseRsaPublicKey(SHORT_KEY);
    expect(key.modulus.toString(2).length).toBeLessThanOrEqual(74 * 8);
    expect(key.modulus.toString(2).length).toBeGreaterThan(73 * 8);
    expect(key.exponent > 1n).toBe(true);
  });

  it('rejects something that is not a key', () => {
    expect(() => parseRsaPublicKey('-----BEGIN RSA PUBLIC KEY-----\nAgE=\n-----END RSA PUBLIC KEY-----')).toThrow();
  });
});
