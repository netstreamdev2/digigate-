"use client";

import { startTransition, useActionState, useEffect, type FormEvent, type ReactNode } from "react";

import { FORM_START, type FormState } from "@/lib/form-state";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "./dialog";
import { FormProblem } from "./form";
import type { IconName } from "./icon";

const BUTTON = "inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink";
const COMPACT_BUTTON = "shrink-0 rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border";
// The same small button on a dark panel: outlined, filling in under the pointer.
const COMPACT_ON_DARK =
  "shrink-0 rounded-pill border border-ink-inverse/30 px-3.5 py-1.5 text-xs font-semibold text-ink-inverse transition hover:border-ink-inverse hover:bg-ink-inverse hover:text-ink focus-visible:bg-ink-inverse focus-visible:text-ink";

type Props = {
  /** The button on the page. */
  label: string;
  title: string;
  icon: IconName;
  submitLabel: string;
  pendingLabel: string;
  action: (previous: FormState, form: FormData) => Promise<FormState>;
  /** Sent with the form, such as the company a new client belongs to. */
  fields?: Record<string, string>;
  /** A small button, for use inside a row. */
  compact?: boolean;
  /** The small button sits on a dark panel. */
  onDark?: boolean;
  /** A wider popup, for forms with more in them. */
  wide?: boolean;
  /** The inputs. */
  children: ReactNode;
};

/** A form that opens in a popup, so a list page stays a list however much can be added to it. */
export function FormDialog({ label, title, icon, submitLabel, pendingLabel, action, fields = {}, compact = false, onDark = false, wide = false, children }: Props) {
  const dialog = useDialog();
  const { ref } = dialog;
  const [state, formAction, pending] = useActionState(action, FORM_START);

  useEffect(() => {
    if (state.saved) ref.current?.close();
  }, [ref, state.saved]);

  // Sent by hand because React empties a form once its action finishes, which would wipe what was typed when it's refused.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  };

  return (
    <>
      <button
        type="button"
        onClick={dialog.open}
        className={compact ? (onDark ? COMPACT_ON_DARK : COMPACT_BUTTON) : BUTTON}
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref} wide={wide}>
        <DialogHeading icon={icon} tone="neutral" title={title} />
        <form key={state.saved} onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <FormProblem message={state.problem} />
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <CancelButton onClick={dialog.close} />
            <ConfirmButton label={submitLabel} pendingLabel={pendingLabel} tone="neutral" pending={pending} />
          </div>
        </form>
      </Dialog>
    </>
  );
}
