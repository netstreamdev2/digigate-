import { describe, expect, it } from 'vitest';

import { inviteBookingFor, inviteCodeFromScan, inviteQrText } from './invites';

const CODE = 'ab'.repeat(32);
const bytesOf = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

describe('inviteCodeFromScan', () => {
  it('reads the code from an invite QR', () => {
    expect(inviteCodeFromScan(bytesOf(inviteQrText(CODE)))).toBe(CODE);
  });

  it('ignores the line ending a scanner adds, and capitals', () => {
    expect(inviteCodeFromScan(bytesOf(`DGI1:${CODE.toUpperCase()}\r\n`))).toBe(CODE);
  });

  it('is not fooled by other barcodes', () => {
    expect(inviteCodeFromScan(bytesOf('8001015009087'))).toBeNull();
    expect(inviteCodeFromScan(bytesOf(`DGI1:${CODE.slice(1)}`))).toBeNull();
    expect(inviteCodeFromScan(bytesOf(`DGI2:${CODE}`))).toBeNull();
    expect(inviteCodeFromScan(new Uint8Array([0x01, 0x9b, 0x09, 0x45]))).toBeNull();
  });
});

describe('inviteBookingFor', () => {
  const booking = { id: 'b1', from: 1_000, until: 2_000, singleUse: true };

  it('opens a booking on its dates', () => {
    expect(inviteBookingFor(booking, 1_500, new Set())).toEqual({ ok: true, booking });
  });

  it('says why it does not', () => {
    expect(inviteBookingFor(null, 1_500, new Set())).toEqual({ ok: false, reason: 'unknown' });
    expect(inviteBookingFor(booking, 500, new Set())).toEqual({ ok: false, reason: 'not-yet' });
    expect(inviteBookingFor(booking, 2_500, new Set())).toEqual({ ok: false, reason: 'over' });
  });

  it('lets a one-visit invite in once', () => {
    expect(inviteBookingFor(booking, 1_500, new Set(['b1']))).toEqual({ ok: false, reason: 'used' });
    expect(inviteBookingFor({ ...booking, singleUse: false }, 1_500, new Set(['b1']))).toEqual({ ok: true, booking: { ...booking, singleUse: false } });
  });
});
