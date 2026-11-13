"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Field, FormProblem, SelectField, TextAreaField } from "@/components/form";
import { Icon } from "@/components/icon";

import { requestSiteLicence } from "./licence-actions";

export function LicenceRequestForm({ orgId, initialName = "", onClose, preview = false }: { orgId: string; initialName?: string; onClose?: () => void; preview?: boolean }) {
  const [state, action, pending] = useActionState(requestSiteLicence, { problem: null, sent: false });
  if (state.sent) return (
    <div role="status" className="mt-5 rounded-lg bg-tile-mint p-5">
      <Icon name="check" className="mb-3 size-7 text-clear" />
      <h3 className="font-display text-xl font-semibold">Your request is with DigiGate</h3>
      <p className="mt-2 text-sm text-ink-muted">Our team will arrange the licence and set up your site. It will appear in your company&apos;s sites when it&apos;s ready.</p>
      {onClose ? <div className="mt-5"><CancelButton label="Done" onClick={onClose} /></div> : null}
    </div>
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) return;
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };
  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
      <div className="rounded-lg bg-tile-sky p-4 text-sm text-ink">
        <p className="font-semibold">Every new site starts with a DigiGate licence</p>
        <p className="mt-1 text-ink-muted">Tell us about the site you&apos;re taking on. DigiGate will arrange its licence and create it for your company.</p>
      </div>
      <input type="hidden" name="orgId" value={orgId} />
      <FormProblem message={state.problem} />
      <Field label="Site name" name="name" defaultValue={initialName} maxLength={120} placeholder="The hospital or estate you guard" autoFocus required />
      <SelectField label="Site type" name="siteType" defaultValue="hospital">
        <option value="hospital">Hospital</option>
        <option value="estate">Residential estate</option>
      </SelectField>
      <TextAreaField label="Anything we should know? (optional)" name="note" maxLength={500} rows={3} placeholder="For example, when you need the site to go live." />
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onClose ? <CancelButton onClick={onClose} /> : null}
        <ConfirmButton label={preview ? "Preview only" : "Request a licence"} pendingLabel="Sending…" tone="neutral" pending={pending || preview} />
      </div>
    </form>
  );
}

export function SiteLicencePrompt({ orgId, preview = false }: { orgId: string; preview?: boolean }) {
  const dialog = useDialog();
  const router = useRouter();
  const [round, setRound] = useState(0);
  return (
    <>
      <button type="button" onClick={dialog.open} className="inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink">Add site</button>
      <Dialog dialogRef={dialog.ref} onClose={() => { setRound((value) => value + 1); router.refresh(); }}>
        <DialogHeading icon="sites" tone="neutral" title="Bring another site onto DigiGate" />
        <LicenceRequestForm key={round} orgId={orgId} onClose={dialog.close} preview={preview} />
      </Dialog>
    </>
  );
}
