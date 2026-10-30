import type { BitReader } from './bit-reader';

const NO_NODE = 0xffff;
const FIELDS = 3;
const PARENT = 0;
const LEAF_FLAG = 1;
/** For an internal node, the index of its first child (the second is next to it); for a leaf, its symbol. */
const CHILD_OR_SYMBOL = 2;

class UnsupportedStream extends Error {}

/**
 * Adaptive Huffman decoder in the codec's layout: nodes kept in decreasing weight order and swapped to stay that
 * way. Symbol `size + 1` escapes to a raw value, which joins the tree as a new leaf.
 */
export class AdaptiveHuffman {
  private readonly nodes: Uint16Array;
  private readonly weights: Int32Array;
  private readonly leafOf: Uint16Array;
  private count = 3;
  private readonly escape: number;

  constructor(
    private readonly size: number,
    seededSymbols: number,
  ) {
    const capacity = 2 * size + 3;
    this.nodes = new Uint16Array(capacity * FIELDS);
    this.weights = new Int32Array(capacity);
    this.leafOf = new Uint16Array(size + 2).fill(NO_NODE);
    this.escape = size + 1;

    this.nodes.set([NO_NODE, 0, 1, 0, 1, size, 0, 1, this.escape]);
    this.weights.set([2, 1, 1]);
    this.leafOf[size] = 1;
    this.leafOf[this.escape] = 2;
    for (let symbol = 0; symbol < seededSymbols; symbol++) {
      this.addSymbol(symbol);
      this.update(symbol);
    }
  }

  private field(node: number, field: number): number {
    return this.nodes[node * FIELDS + field] ?? 0;
  }

  private setField(node: number, field: number, value: number): void {
    this.nodes[node * FIELDS + field] = value;
  }

  private weight(node: number): number {
    return this.weights[node] ?? 0;
  }

  private isLeaf(node: number): boolean {
    return this.field(node, LEAF_FLAG) % 256 !== 0;
  }

  private addSymbol(symbol: number): void {
    if (this.leafOf[symbol] !== NO_NODE) return;
    const last = this.count - 1;
    const moved = this.count;
    const added = this.count + 1;
    for (let field = 0; field < FIELDS; field++) this.setField(moved, field, this.field(last, field));
    this.weights[moved] = this.weight(last);
    this.setField(moved, PARENT, last);
    this.leafOf[this.field(moved, CHILD_OR_SYMBOL)] = moved;
    this.setField(last, CHILD_OR_SYMBOL, moved);
    this.setField(last, LEAF_FLAG, Math.trunc(this.field(last, LEAF_FLAG) / 256) * 256);
    this.setField(added, CHILD_OR_SYMBOL, symbol);
    this.setField(added, LEAF_FLAG, Math.trunc(this.field(added, LEAF_FLAG) / 256) * 256 + 1);
    this.weights[added] = 0;
    this.setField(added, PARENT, last);
    this.leafOf[symbol] = added;
    this.count += 2;
  }

  /** Swaps what two nodes hold. Each position keeps its parent; the children's parent links follow the move. */
  private swap(a: number, b: number): void {
    for (const [node, other] of [[a, b], [b, a]] as const) {
      const child = this.field(node, CHILD_OR_SYMBOL);
      if (this.isLeaf(node)) {
        this.leafOf[child] = other;
      } else {
        this.setField(child, PARENT, other);
        this.setField(child + 1, PARENT, other);
      }
    }
    const flag = this.field(a, LEAF_FLAG);
    const child = this.field(a, CHILD_OR_SYMBOL);
    const weight = this.weight(a);
    this.setField(a, LEAF_FLAG, this.field(b, LEAF_FLAG));
    this.setField(a, CHILD_OR_SYMBOL, this.field(b, CHILD_OR_SYMBOL));
    this.weights[a] = this.weight(b);
    this.setField(b, LEAF_FLAG, flag);
    this.setField(b, CHILD_OR_SYMBOL, child);
    this.weights[b] = weight;
  }

  private update(symbol: number): void {
    // The codec rescales the weights when the root reaches 2^31, which a photo of a few hundred bytes never does.
    if (this.weight(0) >>> 0 === 0x80000000) throw new UnsupportedStream('Huffman weights overflowed');
    const signed = (value: number) => (value << 16) >> 16;
    for (let node = signed(this.leafOf[symbol] ?? NO_NODE); node !== -1; node = signed(this.field(node, PARENT))) {
      this.weights[node] = this.weight(node) + 1;
      let target = node - 1;
      while (target >= 0 && this.weight(target) < this.weight(node)) target--;
      target++;
      if (target !== node) {
        this.swap(node, target);
        node = target;
      }
    }
  }

  /** Decodes one symbol. An escape reads the raw value in `rawBits`; raw values of `size` or more are passed through. */
  decode(reader: BitReader, rawBits: number): number {
    let node = 0;
    while (!this.isLeaf(node)) {
      node = this.field(node, CHILD_OR_SYMBOL) + reader.bit();
      if (reader.failed) return 0;
    }
    let symbol = this.field(node, CHILD_OR_SYMBOL);
    if (symbol === this.escape) {
      symbol = reader.bits(rawBits);
      if (reader.failed) return 0;
      if (symbol >= this.size) {
        this.update(this.escape);
        return symbol;
      }
      this.addSymbol(symbol);
    }
    this.update(symbol);
    return symbol;
  }

  /** A number sent as bytes: each symbol of 255 or more means another, more significant, byte comes first. */
  decodeNumber(reader: BitReader): number {
    const value = this.decode(reader, 8);
    if (value < 255) return value;
    const high = this.decodeNumber(reader);
    return (high << 8) + this.decode(reader, 8);
  }
}

export { UnsupportedStream };
