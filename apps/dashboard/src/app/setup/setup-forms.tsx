"use client";

import { useActionState, useState } from "react";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Field, FormProblem } from "@/components/form";
import { QrImage } from "@/components/qr-image";

import { createPairingCode, type PairingState } from "./actions";

const NO_CODE: PairingState = { problem: null, code: null, qr: null, expiresAt: null };

function LaneChoice({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex h-11 flex-1 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium has-checked:border-ink has-checked:bg-tile-sky">
      <input type="checkbox" name="lanes" value={value} defaultChecked className="accent-ink" />
      {label}
    </label>
  );
}

export function LaneChoices() {
  return (
    <div className="flex gap-2">
      <LaneChoice value="vehicle" label="Cars" />
      <LaneChoice value="pedestrian" label="On foot" />
    </div>
  );
}

const groupCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;

function PairingSteps({ orgId, siteId, onClose }: { orgId: string; siteId: string; onClose: () => void }) {
  const [state, action] = useActionState(createPairingCode, NO_CODE);

  if (state.code && state.qr) {
    return (
      <>
        <DialogHeading icon="device" tone="neutral" title="Scan this on the handheld" />
        <div className="mt-5 flex flex-col items-center gap-3 rounded-md bg-surface-muted p-5">
          <QrImage src={state.qr} alt="Pairing QR code" />
          <p className="font-display text-2xl font-bold tracking-wide">{groupCode(state.code)}</p>
        </div>
        <p className="mt-4 text-sm text-ink-muted">Open the pairing screen on the device, then scan the QR or type the digits. It works once and expires in 10 minutes.</p>
        <div className="mt-6 flex justify-end">
          <CancelButton onClick={onClose} label="Done" />
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeading icon="device" tone="neutral" title="Pair a device" />
      <form action={action} className="mt-5 flex flex-col gap-4">
        <FormProblem message={state.problem} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="siteId" value={siteId} />
        <Field label="Device name" name="name" placeholder="Main Gate DT50" required />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <CancelButton onClick={onClose} />
          <ConfirmButton label="Show pairing code" pendingLabel="Creating…" tone="neutral" />
        </div>
      </form>
    </>
  );
}

export function PairDeviceButton({ orgId, siteId }: { orgId: string; siteId: string }) {
  const dialog = useDialog();
  // Closing starts it fresh, so an old code never sits behind the popup.
  const [round, setRound] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={dialog.open}
        className="inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink"
      >
        Pair a device
      </button>
      <Dialog dialogRef={dialog.ref} onClose={() => setRound(round + 1)}>
        <PairingSteps key={round} orgId={orgId} siteId={siteId} onClose={dialog.close} />
      </Dialog>
    </>
  );
}
