// Personal details kept encrypted: the ID numbers on gate checks and the passwords that lock the Security Checks report.
// AES-256-GCM, with a key for each purpose drawn from the one secret guards' records already use (GUARD_RECORD_KEY), so
// there's one key to keep safe. Each value is bound to what it belongs to (a check's id, a company and address), so a
// value copied onto another row won't open. Nothing here logs what it seals.

const IV_BYTES = 12;
const encoder = new TextEncoder();

export type Purpose = 'check id number' | 'report pdf password';

const keys = new Map<Purpose, Promise<CryptoKey>>();

/** Whether the secret is there: without it nothing can be sealed, and plain values are dropped, never kept. */
export function canSeal(): boolean {
  const secret = Deno.env.get('GUARD_RECORD_KEY') ?? '';
  try {
    return atob(secret).length >= 32;
  } catch {
    return false;
  }
}

function keyFor(purpose: Purpose): Promise<CryptoKey> {
  let key = keys.get(purpose);
  if (!key) {
    key = (async () => {
      const secret = Deno.env.get('GUARD_RECORD_KEY') ?? '';
      if (!secret) throw new Error('GUARD_RECORD_KEY is not set');
      const raw = Uint8Array.from(atob(secret), (character) => character.charCodeAt(0));
      if (raw.length < 32) throw new Error('GUARD_RECORD_KEY is too short');
      const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(`digigate ${purpose} cipher`) },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    })();
    keys.set(purpose, key);
  }
  return key;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

export async function seal(purpose: Purpose, boundTo: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(boundTo) }, await keyFor(purpose), encoder.encode(text));
  const out = new Uint8Array(IV_BYTES + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), IV_BYTES);
  return toBase64(out);
}

/** The value, or null when it won't open: wrong row, damaged, or sealed under another key. */
export async function unseal(purpose: Purpose, boundTo: string, sealed: string): Promise<string | null> {
  try {
    const bytes = fromBase64(sealed);
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: encoder.encode(boundTo) },
      await keyFor(purpose),
      bytes.slice(IV_BYTES),
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
