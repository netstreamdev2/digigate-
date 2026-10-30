// A scan made on the home screen, held in memory for the screen it opens, so the guard doesn't scan twice. Never
// written anywhere and never put in a route, which would leave the document's contents in navigation state.
let pending: Uint8Array | null = null;

export function handOffScan(bytes: Uint8Array): void {
  pending = bytes;
}

/** The handed-off scan, once: taking it clears it. */
export function takeHandedOffScan(): Uint8Array | null {
  const bytes = pending;
  pending = null;
  return bytes;
}
