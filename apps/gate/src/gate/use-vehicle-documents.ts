import { decodeDocument, type DriverLicence, type LicencePhotoResult, type ParsedLicenceDisc } from '@digigate/core';
import { useCallback, useEffect, useState } from 'react';

import { fromBase64 } from '@/lib/bytes';

import { subscribeToScans } from '../../modules/scanner';
import { decodeLicencePhotoLater } from './licence-photo-later';
import { takeHandedOffScan } from './scan-handoff';

export type ScanNotice = { title: string; message: string };

export type VehicleDocumentsState = {
  disc: ParsedLicenceDisc | null;
  licence: DriverLicence | null;
  /** Null while the licence photo is still decoding, or before a licence is scanned. */
  photo: LicencePhotoResult | null;
  /** Why the last scan wasn't used, in the guard's words. Cleared by the next good scan. */
  notice: ScanNotice | null;
};

const EMPTY: VehicleDocumentsState = { disc: null, licence: null, photo: null, notice: null };

const RESCAN = 'Scan it again, holding it flat and steady. If it still fails, type the details in by hand.';

/**
 * Collects the disc and licence for one vehicle, in whichever order they're scanned; a second scan of the same
 * document replaces the first. A scan handed over from the home screen counts as the first. Scans are ignored
 * while `listening` is false, e.g. once the check has run.
 */
export function useVehicleDocuments(listening: boolean): VehicleDocumentsState & { reset: () => void } {
  const [documents, setDocuments] = useState<VehicleDocumentsState>(EMPTY);

  useEffect(() => {
    if (!listening) return;
    const cancels = new Set<() => void>();

    const accept = (bytes: Uint8Array) => {
      const decoded = decodeDocument(bytes);
      switch (decoded.kind) {
        case 'licence-disc':
          setDocuments((current) => ({ ...current, disc: decoded.disc, notice: null }));
          return;
        case 'driver-licence':
          setDocuments((current) => ({ ...current, licence: decoded.licence, photo: null, notice: null }));
          cancels.add(
            decodeLicencePhotoLater(
              bytes,
              (photo) => setDocuments((current) => (current.licence === decoded.licence ? { ...current, photo } : current)),
              (message) =>
                setDocuments((current) => ({
                  ...current,
                  photo: { ok: false, reason: 'damaged' },
                  notice: { title: "Couldn't read the licence photo", message: `Check the photo on the card instead. (${message})` },
                })),
            ),
          );
          return;
        case 'smart-id':
        case 'id-number':
          setDocuments((current) => ({
            ...current,
            notice: { title: 'That was an ID', message: "For a driver, scan the back of their driver's licence." },
          }));
          return;
        case 'unreadable':
          setDocuments((current) => ({
            ...current,
            notice: { title: `Couldn't read the ${decoded.document === 'licence-disc' ? 'licence disc' : "driver's licence"}`, message: RESCAN },
          }));
          return;
        case 'unrecognised':
          setDocuments((current) => ({
            ...current,
            notice: { title: 'Not a document DigiGate knows', message: "Scan the licence disc on the windscreen and the back of the driver's licence." },
          }));
          return;
      }
    };

    const handedOff = takeHandedOffScan();
    if (handedOff) accept(handedOff);
    const subscription = subscribeToScans((event) => accept(fromBase64(event.bytes)));
    return () => {
      subscription?.remove();
      for (const cancel of cancels) cancel();
    };
  }, [listening]);

  const reset = useCallback(() => setDocuments(EMPTY), []);
  return { ...documents, reset };
}
