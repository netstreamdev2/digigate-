import { describe, expect, it } from 'vitest';

import { bigIntToBytes, bytesToBigInt, bytesToText, decodeBase64 } from './bytes';

describe('decodeBase64', () => {
  it('decodes standard base64, ignoring padding and line breaks', () => {
    expect(bytesToText(decodeBase64('TWFu'))).toBe('Man');
    expect(bytesToText(decodeBase64('TWE=\n'))).toBe('Ma');
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeBase64('TW!u')).toThrow();
  });
});

describe('big integers and bytes', () => {
  it('round-trip, left-padded to the requested length', () => {
    const bytes = Uint8Array.from([0x00, 0x01, 0xff]);
    expect(bytesToBigInt(bytes)).toBe(511n);
    expect(Array.from(bigIntToBytes(511n, 3))).toEqual([0x00, 0x01, 0xff]);
  });

  it('refuses a value too big for the length', () => {
    expect(() => bigIntToBytes(256n, 1)).toThrow(RangeError);
  });
});
