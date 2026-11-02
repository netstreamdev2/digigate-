import type { IsoDate, LicenceDisc } from '../rules/types';

import { bytesToText } from './bytes';

const FIELD_COUNT = 14;

/** Everything the disc's barcode carries that DigiGate uses. Field order confirmed on a real disc. */
export type ParsedLicenceDisc = LicenceDisc & {
  registerNumber: string;
  /** English / Afrikaans, as printed, e.g. "Hatch back / Luikrug". */
  description: string;
  make: string;
  model: string;
  /** English / Afrikaans, e.g. "White / Wit". */
  colour: string;
  engineNumber: string;
};

export type LicenceDiscResult =
  | { ok: true; disc: ParsedLicenceDisc }
  | { ok: false; reason: 'not-text' | 'wrong-field-count' | 'bad-vin' | 'bad-expiry-date' };

export function isLicenceDiscBarcode(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25;
}

export function parseLicenceDisc(bytes: Uint8Array): LicenceDiscResult {
  if (!bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) return { ok: false, reason: 'not-text' };

  const text = bytesToText(bytes);
  if (!text.startsWith('%') || !text.endsWith('%')) return { ok: false, reason: 'wrong-field-count' };
  const fields = text.slice(1, -1).split('%').map((field) => field.trim());
  if (fields.length !== FIELD_COUNT) return { ok: false, reason: 'wrong-field-count' };

  const [, , , , discNumber, plate, registerNumber, description, make, model, colour, vin, engineNumber, expiresOn] =
    fields as [string, string, string, string, string, string, string, string, string, string, string, string, string, IsoDate];

  if (!/^[A-Z0-9]{17}$/.test(vin)) return { ok: false, reason: 'bad-vin' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { ok: false, reason: 'bad-expiry-date' };

  return {
    ok: true,
    disc: { discNumber, plate, registerNumber, description, make, model, colour, vin, engineNumber, expiresOn },
  };
}

/** The English half of a bilingual disc value: "White / Wit" → "White". */
export function englishPart(value: string): string {
  return value.split(' / ')[0]?.trim() ?? value;
}
