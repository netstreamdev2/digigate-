import { bytesToBigInt, decodeBase64 } from './bytes';

export type RsaPublicKey = {
  modulus: bigint;
  exponent: bigint;
};

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let square = base % modulus;
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) result = (result * square) % modulus;
    square = (square * square) % modulus;
    remaining >>= 1n;
  }
  return result;
}

function readLength(der: Uint8Array, position: number): [length: number, next: number] {
  const first = der[position];
  if (first === undefined) throw new Error('DER ended early');
  if ((first & 0x80) === 0) return [first, position + 1];
  const byteCount = first & 0x7f;
  let length = 0;
  for (let index = 1; index <= byteCount; index++) {
    const byte = der[position + index];
    if (byte === undefined) throw new Error('DER ended early');
    length = length * 256 + byte;
  }
  return [length, position + 1 + byteCount];
}

function readInteger(der: Uint8Array, position: number): [value: bigint, next: number] {
  if (der[position] !== 0x02) throw new Error('Expected a DER INTEGER');
  const [length, start] = readLength(der, position + 1);
  return [bytesToBigInt(der.subarray(start, start + length)), start + length];
}

/** Parses a PKCS#1 `-----BEGIN RSA PUBLIC KEY-----` PEM: SEQUENCE { modulus INTEGER, exponent INTEGER }. */
export function parseRsaPublicKey(pem: string): RsaPublicKey {
  const der = decodeBase64(pem.replace(/-----[^-]+-----/g, ''));
  if (der[0] !== 0x30) throw new Error('Expected a DER SEQUENCE');
  const [, start] = readLength(der, 1);
  const [modulus, next] = readInteger(der, start);
  const [exponent] = readInteger(der, next);
  return { modulus, exponent };
}
