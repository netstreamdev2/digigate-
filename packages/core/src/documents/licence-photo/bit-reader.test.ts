import { describe, expect, it } from 'vitest';

import { BitReader } from './bit-reader';

describe('BitReader', () => {
  it('reads the most significant bit first, across byte boundaries', () => {
    const reader = new BitReader(Uint8Array.from([0b1010_0001, 0b1100_0000]));
    expect(reader.bits(3)).toBe(0b101);
    expect(reader.bits(6)).toBe(0b0_0001_1);
    expect(reader.bit()).toBe(1);
    expect(reader.failed).toBe(false);
  });

  it('keeps only the low 8 bits of a longer read, like the codec', () => {
    expect(new BitReader(Uint8Array.from([0x12, 0x34])).bits(16)).toBe(0x34);
  });

  it('returns 0 and flags the failure when a read runs past the end', () => {
    const reader = new BitReader(Uint8Array.from([0xff]));
    expect(reader.bits(4)).toBe(0xf);
    expect(reader.bits(8)).toBe(0);
    expect(reader.failed).toBe(true);
  });

  it('drops the rest of the byte when aligning', () => {
    const reader = new BitReader(Uint8Array.from([0b1000_0000, 0b0100_0000]));
    expect(reader.bit()).toBe(1);
    reader.alignToByte();
    expect(reader.bits(2)).toBe(0b01);
  });
});
