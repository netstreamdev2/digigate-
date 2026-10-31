"use client";

import { useActionState, useEffect, type ReactNode } from "react";

import { FORM_START, type FormState } from "@/lib/form-state";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "./dialog";
import { FormProblem } from "./form";
import type { IconName } from "./icon";

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
  /** The inputs. */
  children: ReactNode;
};

/** A form that opens in a popup, so a list page stays a list however much can be added to it. */
export function FormDialog({ label, title, icon, submitLabel, pendingLabel, action, fields = {}, children }: Props) {
  const dialog = useDialog();
  const { ref } = dialog;
  const [state, formAction] = useActionState(action, FORM_START);

  useEffect(() => {
    if (state.saved) ref.current?.close();
  }, [ref, state.saved]);

  return (
    <>
      <button
        type="button"
        onClick={dialog.open}
        className="inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink"
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref}>
        <DialogHeading icon={icon} tone="neutral" title={title} />
        <form key={state.saved} action={formAction} className="mt-5 flex flex-col gap-4">
          <FormProblem message={state.problem} />
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <CancelButton onClick={dialog.close} />
            <ConfirmButton label={submitLabel} pendingLabel={pendingLabel} tone="neutral" />
          </div>
        </form>
      </Dialog>
    </>
  );
}
