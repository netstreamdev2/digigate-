import type { EpochMs } from './rules/types';

/*
 * Visitor invites. A host invites a visitor from their phone, and the visitor shows a QR at the gate. The QR holds
 * DGI1: and the invite's code, 64 hex characters; the server and the handhelds keep only a SHA-256 of the code. It is
 * recognised by what it says, never by the symbology a scanner reports, so it reads the same on any scanner brand.
 * An invite says a visitor is expected, never who they are: their ID or licence is still scanned and every rule runs.
 */

export const INVITE_QR_PREFIX = 'DGI1:';

const INVITE_QR = /^DGI1:([0-9a-f]{64})$/i;

/** What an invite's QR holds, for the phone app to draw. */
export const inviteQrText = (code: string): string => `${INVITE_QR_PREFIX}${code.toLowerCase()}`;

/** The invite code in a scan, or null when the scan isn't an invite. Trailing whitespace from a scanner is ignored. */
export function inviteCodeFromScan(bytes: Uint8Array): string | null {
  if (bytes.length > 128) return null;
  let text = '';
  for (const byte of bytes) {
    if (byte < 0x09 || byte > 0x7e) return null;
    text += String.fromCharCode(byte);
  }
  const match = INVITE_QR.exec(text.trim());
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** A booking as far as an invite needs it. */
export type InviteBooking = { id: string; from: EpochMs; until: EpochMs; singleUse?: boolean };

export type InviteMatch<T extends InviteBooking> =
  | { ok: true; booking: T }
  /** unknown: not this site's, cancelled, or never synced here. */
  | { ok: false; reason: 'unknown' | 'not-yet' | 'over' | 'used' };

/** The booking an invite opens now, or why it doesn't. `used` holds the bookings already let in on this handheld. */
export function inviteBookingFor<T extends InviteBooking>(booking: T | null, at: EpochMs, used: ReadonlySet<string>): InviteMatch<T> {
  if (!booking) return { ok: false, reason: 'unknown' };
  if (booking.singleUse && used.has(booking.id)) return { ok: false, reason: 'used' };
  if (at < booking.from) return { ok: false, reason: 'not-yet' };
  if (at > booking.until) return { ok: false, reason: 'over' };
  return { ok: true, booking };
}
