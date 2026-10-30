import { describe, expect, it } from 'vitest';

import { AdaptiveHuffman } from './adaptive-huffman';
import { BitReader } from './bit-reader';

// A new tree holds two leaves: the symbol `size` behind a 0 bit and the escape behind a 1 bit.
describe('AdaptiveHuffman', () => {
  it('decodes the starting tree: 0 is the symbol equal to the alphabet size', () => {
    expect(new AdaptiveHuffman(4, 0).decode(new BitReader(Uint8Array.from([0b0000_0000])), 2)).toBe(4);
  });

  it('reads a raw value after the escape and adds it to the tree', () => {
    const model = new AdaptiveHuffman(4, 0);
    const reader = new BitReader(Uint8Array.from([0b1_10_0_0000]));
    expect(model.decode(reader, 2)).toBe(2);
    expect(reader.failed).toBe(false);
  });

  it('passes a raw value at or above the alphabet size straight through', () => {
    expect(new AdaptiveHuffman(3, 0).decode(new BitReader(Uint8Array.from([0b1_11_0_0000])), 2)).toBe(3);
  });

  it('returns 0 and flags the failure when the bits run out mid-code', () => {
    const reader = new BitReader(Uint8Array.from([0b1000_0000]));
    expect(new AdaptiveHuffman(4, 0).decode(reader, 8)).toBe(0);
    expect(reader.failed).toBe(true);
  });
});
