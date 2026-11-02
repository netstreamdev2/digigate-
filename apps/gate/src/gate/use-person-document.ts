import { decodeDocument } from '@digigate/core';
import { useCallback, useEffect, useState } from 'react';

import type { IdBookDetails } from '@/components/document-preview';
import type { PersonDocument } from '@/components/person-card';
import { fromBase64 } from '@/lib/bytes';

import { subscribeToScans } from '../../modules/scanner';
import { decodeLicencePhotoLater } from './licence-photo-later';
import { takeHandedOffScan } from './scan-handoff';
import type { ScanNotice } from './use-vehicle-documents';

export type PersonDocumentState = {
  person: PersonDocument | null;
  /** A scan that held only an ID number, waiting for the guard to say whether it's an ID book or a smart ID. */
  idNumberOnly: string | null;
  notice: ScanNotice | null;
};

const EMPTY: PersonDocumentState = { person: null, idNumberOnly: null, notice: null };

const AIM_AT_THE_BIG_BARCODE: ScanNotice = {
  title: 'Scan the large square barcode',
  message: 'On the back of the smart ID there are two barcodes. Aim at the large square one, not the thin stripes beside it.',
};

/**
 * The smart ID, driver's licence or green ID book of someone on foot; a new scan replaces the last. A scan handed
 * over from the home screen counts as the first. Scans are ignored while `listening` is false.
 */
export function usePersonDocument(listening: boolean) {
  const [state, setState] = useState<PersonDocumentState>(EMPTY);

  useEffect(() => {
    if (!listening) return;
    const cancels = new Set<() => void>();

    const accept = (bytes: Uint8Array) => {
      const decoded = decodeDocument(bytes);
      switch (decoded.kind) {
        case 'smart-id':
          setState({ person: { kind: 'smart-id', card: decoded.card }, idNumberOnly: null, notice: null });
          return;
        case 'driver-licence': {
          const { licence } = decoded;
          setState({ person: { kind: 'driver-licence', licence, photo: null }, idNumberOnly: null, notice: null });
          cancels.add(
            decodeLicencePhotoLater(
              bytes,
              (photo) =>
                setState((current) =>
                  current.person?.kind === 'driver-licence' && current.person.licence === licence
                    ? { ...current, person: { ...current.person, photo } }
                    : current,
                ),
              (message) =>
                setState((current) => ({
                  ...current,
                  person: current.person?.kind === 'driver-licence' ? { ...current.person, photo: { ok: false, reason: 'damaged' } } : current.person,
                  notice: { title: "Couldn't read the licence photo", message: `Check the photo on the card instead. (${message})` },
                })),
            ),
          );
          return;
        }
        case 'id-number':
          setState((current) => ({ ...current, idNumberOnly: decoded.idNumber, notice: null }));
          return;
        case 'licence-disc':
          setState((current) => ({
            ...current,
            notice: { title: 'That was a licence disc', message: "On foot, scan the person's ID or driver's licence." },
          }));
          return;
        case 'unreadable':
          setState((current) => ({
            ...current,
            notice: { title: "Couldn't read that card", message: 'Scan it again, holding it flat and steady. If it still fails, type the details in by hand.' },
          }));
          return;
        case 'unrecognised':
          setState((current) => ({
            ...current,
            notice: { title: 'Not a document DigiGate knows', message: "Scan the barcode of an ID book, a smart ID card or a driver's licence." },
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

  const reset = useCallback(() => setState(EMPTY), []);
  /** The guard said it's a smart ID: drop the number and ask for the large barcode. */
  const retryForSmartId = useCallback(() => setState((current) => ({ ...current, idNumberOnly: null, notice: AIM_AT_THE_BIG_BARCODE })), []);
  /** The guard said it's an ID book and typed in the rest. */
  const acceptIdBook = useCallback(
    (book: IdBookDetails) => setState({ person: { kind: 'id-book', ...book }, idNumberOnly: null, notice: null }),
    [],
  );
  const dismissIdNumber = useCallback(() => setState((current) => ({ ...current, idNumberOnly: null })), []);

  return { ...state, reset, retryForSmartId, acceptIdBook, dismissIdNumber };
}
