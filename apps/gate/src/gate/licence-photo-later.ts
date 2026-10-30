import { decodeLicencePhoto, type LicencePhotoResult } from '@digigate/core';

/**
 * Decodes a licence photo on the next tick, once the scan's details are on screen, so the photo never holds up the
 * result. Returns a cancel function for when the screen goes away first.
 */
export function decodeLicencePhotoLater(
  bytes: Uint8Array,
  onPhoto: (photo: LicencePhotoResult) => void,
  onError: (message: string) => void,
): () => void {
  const timer = setTimeout(() => {
    try {
      onPhoto(decodeLicencePhoto(bytes));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'unknown error');
    }
  }, 0);
  return () => clearTimeout(timer);
}
