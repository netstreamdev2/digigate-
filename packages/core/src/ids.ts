const RANDOM_BYTES = 10;

/**
 * A UUIDv7: the first 48 bits are the Unix time in milliseconds, so IDs sort by when they were made.
 * `random` must hold at least 10 cryptographically random bytes; core takes them as input to stay platform-free.
 */
export function uuidv7(timestampMs: number, random: Uint8Array): string {
  if (random.length < RANDOM_BYTES) {
    throw new RangeError(`uuidv7 needs ${RANDOM_BYTES} random bytes, got ${random.length}`);
  }

  const bytes = new Uint8Array(16);
  let time = Math.floor(timestampMs);
  for (let index = 5; index >= 0; index--) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes.set(random.subarray(0, RANDOM_BYTES), 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
