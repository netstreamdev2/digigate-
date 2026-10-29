import { decodeDriverLicence, isDriverLicenceBarcode, type DriverLicence } from './driver-licence';
import { isLicenceDiscBarcode, parseLicenceDisc, type ParsedLicenceDisc } from './licence-disc';

export type DecodedDocument =
  | { kind: 'licence-disc'; disc: ParsedLicenceDisc }
  | { kind: 'driver-licence'; licence: DriverLicence }
  /** Recognised, but its contents didn't decode: ask for a rescan, never guess. */
  | { kind: 'unreadable'; document: 'licence-disc' | 'driver-licence'; reason: string }
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
  return { kind: 'unrecognised' };
}
