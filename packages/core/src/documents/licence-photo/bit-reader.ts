/**
 * Most-significant-bit-first reader over the photo bytes. It reproduces the codec's own reader, quirks included,
 * because the decoder must match it bit for bit.
 */
export class BitReader {
  /** Set once a read runs past the end, or when a stage finds the stream damaged. Every stage checks it. */
  failed = false;
  private mask = 0x80;
  private current = 0;
  private position = 0;

  constructor(private readonly data: Uint8Array) {}

  private load(): boolean {
    const byte = this.data[this.position];
    if (byte === undefined) {
      this.failed = true;
      return false;
    }
    this.current = byte;
    this.position += 1;
    return true;
  }

  private advance(): void {
    this.mask >>= 1;
    if (this.mask === 0) this.mask = 0x80;
  }

  bit(): number {
    if (this.mask === 0x80 && !this.load()) return 0;
    const bit = this.current & this.mask ? 1 : 0;
    this.advance();
    return bit;
  }

  /** Reads `count` bits. Like the codec, a read past the end returns 0 and only the low 8 bits are kept. */
  bits(count: number): number {
    let value = 0;
    for (let weight = 1 << (count - 1); weight !== 0; weight = Math.trunc(weight / 2)) {
      if (this.mask === 0x80 && !this.load()) return 0;
      if (this.current & this.mask) value |= weight;
      this.advance();
    }
    return value & 0xff;
  }

  /** Drops the rest of the current byte. */
  alignToByte(): void {
    this.mask = 0x80;
  }
}
