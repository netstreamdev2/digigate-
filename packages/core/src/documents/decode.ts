import { decodeDriverLicence, isDriverLicenceBarcode, type DriverLicence } from './driver-licence';
import { idNumberFromBarcode } from './id-number-barcode';
import { isLicenceDiscBarcode, parseLicenceDisc, type ParsedLicenceDisc } from './licence-disc';
import { isSmartIdBarcode, parseSmartId, type SmartIdCard } from './smart-id';

export type DecodedDocument =
  | { kind: 'licence-disc'; disc: ParsedLicenceDisc }
  | { kind: 'driver-licence'; licence: DriverLicence }
  | { kind: 'smart-id'; card: SmartIdCard }
  /** Only an SA ID number: a green ID book, or the small barcode on a smart ID card. */
  | { kind: 'id-number'; idNumber: string }
  /** Recognised, but its contents didn't decode: ask for a rescan, never guess. */
  | { kind: 'unreadable'; document: 'licence-disc' | 'driver-licence' | 'smart-id'; reason: string }
  | { kind: 'unrecognised' };

/** Works out which document a scan came from and decodes it. */
export function decodeDocument(bytes: Uint8Array): DecodedDocument {
  if (isLicenceDiscBarcode(bytes)) {
    const result = parseLicenceDisc(bytes);
    return result.ok ? { kind: 'licence-disc', disc: result.disc } : { kind: 'unreadable', document: 'licence-disc', reason: result.reason };
  }
  if (isDriverLicenceBarcode(bytes)) {
    const result = decodeDriverLicence(bytes);
    return result.ok
      ? { kind: 'driver-licence', licence: result.licence }
      : { kind: 'unreadable', document: 'driver-licence', reason: result.reason };
  }
  if (isSmartIdBarcode(bytes)) {
    const result = parseSmartId(bytes);
    return result.ok ? { kind: 'smart-id', card: result.card } : { kind: 'unreadable', document: 'smart-id', reason: result.reason };
  }
  const idNumber = idNumberFromBarcode(bytes);
  if (idNumber) return { kind: 'id-number', idNumber };
  return { kind: 'unrecognised' };
}
