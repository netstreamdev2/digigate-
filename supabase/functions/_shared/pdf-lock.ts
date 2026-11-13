// Locks a PDF with a password: AES-256, the strongest encryption the PDF standard has (ISO 32000-2, revision 6), which
// every current reader asks the password for. The daily Security Checks report travels by email locked like this, with
// each recipient's own password, set once and never emailed (the user's decision, 13 November).
//
// pdf-lib can't encrypt, so this does it the standard's way: one random 256-bit file key encrypts every stream and every
// string; the password unlocks the file key. The document itself is left as it was, so one report can be locked for
// several people in turn. WebCrypto only, so it runs the same in Deno and Node.
import pdfLib, { type PDFArray as PdfArray, type PDFDict as PdfDict, type PDFDocument, type PDFObject, type PDFRef } from 'npm:pdf-lib@1.17.1';

const { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFStream, PDFString } = pdfLib;

const subtle = globalThis.crypto.subtle;

// Printing and screen readers allowed; changing, copying and assembling not. Readers honour these, nothing more.
// Bits 3 (print), 10 (accessibility) and 12 (high-quality print), with the reserved bits 7, 8 and 13–32 set.
const PERMISSIONS = -1340;
const LONGEST_PASSWORD_BYTES = 127;

/** Bytes in a plain ArrayBuffer, which is what WebCrypto takes. */
type Bytes = Uint8Array<ArrayBuffer>;

function random(length: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function join(...parts: readonly Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function cbc(key: Bytes, iv: Bytes, data: Bytes): Promise<Bytes> {
  const cryptoKey = await subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, data));
}

/** CBC without padding, for data already a whole number of blocks: WebCrypto always pads, so the padding block goes. */
async function cbcNoPadding(key: Bytes, iv: Bytes, data: Bytes): Promise<Bytes> {
  return (await cbc(key, iv, data)).subarray(0, data.length);
}

async function sha(bits: 256 | 384 | 512, data: Bytes): Promise<Bytes> {
  return new Uint8Array(await subtle.digest(`SHA-${bits}`, data));
}

/** The standard's password hash (ISO 32000-2, algorithm 2.B): at least 64 rounds of AES and SHA-2, chosen as it goes. */
async function passwordHash(password: Bytes, salt: Bytes, userKey: Bytes): Promise<Bytes> {
  let key = await sha(256, join(password, salt, userKey));
  for (let round = 0; ; ) {
    const one = join(password, key, userKey);
    const block = new Uint8Array(one.length * 64);
    for (let copy = 0; copy < 64; copy++) block.set(one, copy * one.length);
    const encrypted = await cbcNoPadding(key.subarray(0, 16), key.subarray(16, 32), block);
    // The first 16 bytes as one big number, mod 3: the same as the sum of the bytes mod 3, since 256 is 1 mod 3.
    const choice = encrypted.subarray(0, 16).reduce((sum, byte) => sum + byte, 0) % 3;
    key = await sha(choice === 0 ? 256 : choice === 1 ? 384 : 512, encrypted);
    round++;
    if (round >= 64 && encrypted[encrypted.length - 1] <= round - 32) break;
  }
  return key.subarray(0, 32);
}

function passwordBytes(password: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(password.normalize('NFKC')).subarray(0, LONGEST_PASSWORD_BYTES));
}

type Keys = { fileKey: Bytes; entries: Record<'O' | 'U' | 'OE' | 'UE' | 'Perms', Bytes> };

async function keysFor(password: string): Promise<Keys> {
  const fileKey = random(32);
  const user = passwordBytes(password);
  // Nobody holds the owner password: it only has to exist and be unguessable.
  const owner = passwordBytes(toHex(random(32)));
  const zeroIv = new Uint8Array(16);

  const [userCheckSalt, userKeySalt] = [random(8), random(8)];
  const U = join(await passwordHash(user, userCheckSalt, new Uint8Array()), userCheckSalt, userKeySalt);
  const UE = await cbcNoPadding(await passwordHash(user, userKeySalt, new Uint8Array()), zeroIv, fileKey);

  const [ownerCheckSalt, ownerKeySalt] = [random(8), random(8)];
  const O = join(await passwordHash(owner, ownerCheckSalt, U), ownerCheckSalt, ownerKeySalt);
  const OE = await cbcNoPadding(await passwordHash(owner, ownerKeySalt, U), zeroIv, fileKey);

  const permissions = new Uint8Array(16);
  new DataView(permissions.buffer).setInt32(0, PERMISSIONS, true);
  permissions.set([0xff, 0xff, 0xff, 0xff], 4);
  permissions.set([0x54, 0x61, 0x64, 0x62], 8); // "Tadb": metadata is encrypted too.
  permissions.set(random(4), 12);
  const Perms = await cbcNoPadding(fileKey, zeroIv, permissions);

  return { fileKey, entries: { O, U, OE, UE, Perms } };
}

/** A string or stream's bytes, encrypted as the standard asks: a random IV in front, then AES-256-CBC with padding. */
async function seal(fileKey: Bytes, bytes: Uint8Array): Promise<Bytes> {
  const iv = random(16);
  // Copied, so WebCrypto gets bytes of their own whatever buffer pdf-lib kept them in.
  return join(iv, await cbc(fileKey, iv, new Uint8Array(bytes)));
}

/** A copy of a value with every string in it encrypted, or the value itself when it holds none. */
async function sealStrings(value: PDFObject, fileKey: Bytes): Promise<PDFObject> {
  if (value instanceof PDFString || value instanceof PDFHexString) return PDFHexString.of(toHex(await seal(fileKey, value.asBytes())));
  if (value instanceof PDFDict) {
    let copy: PdfDict | null = null;
    for (const [key, entry] of value.entries()) {
      const sealed = await sealStrings(entry, fileKey);
      if (sealed !== entry) {
        copy ??= value.clone();
        copy.set(key, sealed);
      }
    }
    return copy ?? value;
  }
  if (value instanceof PDFArray) {
    let copy: PdfArray | null = null;
    for (let index = 0; index < value.size(); index++) {
      const entry = value.get(index);
      const sealed = await sealStrings(entry, fileKey);
      if (sealed !== entry) {
        copy ??= value.clone();
        copy.set(index, sealed);
      }
    }
    return copy ?? value;
  }
  return value;
}

/**
 * The document's bytes locked with the password. The document is put back as it was afterwards, so the same report can
 * be locked again for the next person, each with their own password and file key.
 */
export async function lockedPdf(doc: PDFDocument, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('A locked PDF needs a password');
  // Fonts and images are only written into the document on a flush: they must be in before they're encrypted.
  await doc.flush();
  const { context } = doc;
  const { fileKey, entries } = await keysFor(password);

  const originals: [PDFRef, PDFObject][] = [];
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    let replacement: PDFObject;
    if (object instanceof PDFStream) {
      const dict = (await sealStrings(object.dict, fileKey)) as PdfDict;
      replacement = PDFRawStream.of(dict === object.dict ? object.dict.clone() : dict, await seal(fileKey, object.getContents()));
    } else {
      replacement = await sealStrings(object, fileKey);
    }
    if (replacement === object) continue;
    originals.push([ref, object]);
    context.assign(ref, replacement);
  }

  const cryptFilter = context.obj({ Type: 'CryptFilter', CFM: 'AESV3', AuthEvent: 'DocOpen', Length: 32 });
  const encrypt = context.obj({
    Filter: 'Standard',
    V: 5,
    R: 6,
    Length: 256,
    P: PDFNumber.of(PERMISSIONS),
    EncryptMetadata: true,
    CF: context.obj({ StdCF: cryptFilter }),
    StmF: PDFName.of('StdCF'),
    StrF: PDFName.of('StdCF'),
  });
  for (const [name, bytes] of Object.entries(entries)) encrypt.set(PDFName.of(name), PDFHexString.of(toHex(bytes)));
  const encryptRef = context.register(encrypt);
  const id = PDFHexString.of(toHex(random(16)));
  const before = { Encrypt: context.trailerInfo.Encrypt, ID: context.trailerInfo.ID };
  context.trailerInfo.Encrypt = encryptRef;
  // The file's identifier is never encrypted: readers compare it as written.
  context.trailerInfo.ID = context.obj([id, id]);

  try {
    return await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
  } finally {
    for (const [ref, object] of originals) context.assign(ref, object);
    context.delete(encryptRef);
    context.trailerInfo.Encrypt = before.Encrypt;
    context.trailerInfo.ID = before.ID;
  }
}
