"use client";

import { useActionState, useState } from "react";

import { CancelButton, ConfirmAction, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { FormProblem } from "@/components/form";
import { Icon } from "@/components/icon";
import { shortDate } from "@/lib/format";
import type { PdfPasswordLine } from "@/lib/reports";

import { removePdfPassword, setPdfPassword, type PdfPasswordState } from "../actions";

const NOTHING_YET: PdfPasswordState = { problem: null, email: null, password: null };

/** The new password, shown once: the admin passes it on by phone or WhatsApp, never by email. */
function ShowOnce({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      <p className="text-ink-muted">
        This is the password for <strong className="text-ink">{email}</strong>. Give it to them by phone or WhatsApp. Don&apos;t email it: anyone who sees that email could open the report. It won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted p-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-lg font-semibold tracking-wide text-brand">{password}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(password).then(() => setCopied(true));
          }}
          className="inline-flex h-9 shrink-0 items-center rounded-pill bg-brand px-3.5 text-xs font-semibold text-ink-inverse transition hover:bg-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-ink-muted">Every Security Checks report sent to this address from now on opens with it. A new password replaces this one.</p>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="inline-flex h-11 items-center rounded-pill bg-surface-muted px-5 text-sm font-semibold transition hover:bg-border">
          Done
        </button>
      </div>
    </div>
  );
}

function SetPasswordButton({ org, email, label }: { org: string; email?: string; label: string }) {
  const dialog = useDialog();
  const { ref } = dialog;
  const [state, formAction] = useActionState(setPdfPassword, NOTHING_YET);
  // Once closed, a password is never shown again: the next opening starts a new one.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const shown = state.password && state.password !== dismissed ? state.password : null;

  const finish = () => {
    setDismissed(state.password);
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={dialog.open}
        className={email ? "rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold transition hover:bg-border" : "inline-flex h-11 shrink-0 items-center gap-2 rounded-pill bg-brand px-4 text-sm font-semibold text-ink-inverse transition hover:bg-ink"}
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref} onClose={() => setDismissed(state.password)}>
        <DialogHeading icon="lock" tone="neutral" title={shown ? "Password ready" : "Set a Security Checks password"} />
        {shown && state.email ? (
          <ShowOnce email={state.email} password={shown} onDone={finish} />
        ) : (
          <form action={formAction} className="mt-4 flex flex-col gap-4 text-sm">
            <FormProblem message={state.problem} />
            <input type="hidden" name="org" value={org} />
            {email ? (
              <>
                <input type="hidden" name="email" value={email} />
                <p className="text-ink-muted">
                  DigiGate makes a strong new password for <strong className="text-ink">{email}</strong>. Any password this address had stops working.
                </p>
              </>
            ) : (
              <label className="flex flex-col gap-1.5 font-medium">
                Email address
                <input name="email" type="email" required autoComplete="off" placeholder="manager@company.co.za" className="h-12 rounded-md border border-border bg-surface px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-tile-sky" />
              </label>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <CancelButton onClick={dialog.close} />
              <ConfirmButton label="Make password" pendingLabel="Making…" tone="neutral" />
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

/**
 * Who can open the Security Checks report: each address has its own PDF password, set here and given out by phone. The
 * report goes only to addresses with one; the others get the summary and a note.
 */
export function PdfPasswords({ org, lines }: { org: string; lines: readonly PdfPasswordLine[] }) {
  return (
    <div className="flex flex-col gap-4">
      {lines.length ? (
        <ul className="divide-y divide-ink/10">
          {lines.map((line) => (
            <li key={line.email} className="flex flex-wrap items-center gap-3 py-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-pill ${line.setAt ? "bg-clear-soft text-clear" : "bg-warning-soft text-warning"}`}>
                <Icon name={line.setAt ? "lock" : "unlock"} className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{line.email}</p>
                <p className="text-xs text-ink-muted">
                  {line.setAt ? `Password set ${shortDate(line.setAt)}` : "No password yet: gets the summary only"}
                  {line.onSchedule ? "" : " · not on a Security Checks schedule"}
                </p>
              </div>
              <div className="flex gap-1.5">
                <SetPasswordButton org={org} email={line.email} label={line.setAt ? "New password" : "Set password"} />
                {line.setAt ? (
                  <ConfirmAction
                    label="Remove"
                    title="Remove this password?"
                    confirmLabel="Remove password"
                    pendingLabel="Removing…"
                    tone="danger"
                    icon="unlock"
                    action={removePdfPassword}
                    fields={{ org, email: line.email }}
                  >
                    {`${line.email} will stop getting the Security Checks report and get the summary only, until a new password is set.`}
                  </ConfirmAction>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-ink-muted">No one yet. Automate a daily report with Security Checks, or set a password for an address below.</p>
      )}
      <div>
        <SetPasswordButton org={org} label="Set a password for another address" />
      </div>
    </div>
  );
}
