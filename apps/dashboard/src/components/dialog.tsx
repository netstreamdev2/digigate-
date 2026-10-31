"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";

import { Icon, type IconName } from "./icon";

type Tone = "danger" | "neutral";

const CANCEL = "inline-flex h-11 items-center justify-center rounded-pill bg-surface-muted px-5 text-sm font-semibold text-ink transition hover:bg-border";

const CONFIRM: Record<Tone, string> = {
  danger: "bg-blocked hover:bg-ink",
  neutral: "bg-brand hover:bg-ink",
};

const BADGE: Record<Tone, string> = {
  danger: "bg-blocked-soft text-blocked",
  neutral: "bg-tile-sky text-brand",
};

export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return { ref, open: () => ref.current?.showModal(), close: () => ref.current?.close() };
}

/** A popup in the browser's own dialog, which handles focus, the Escape key and the page behind it. */
export function Dialog({ dialogRef, onClose, children }: { dialogRef: RefObject<HTMLDialogElement | null>; onClose?: () => void; children: ReactNode }) {
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="dg-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-surface p-0 text-ink shadow-floating backdrop:bg-ink/50"
    >
      <div className="p-6 sm:p-7">{children}</div>
    </dialog>
  );
}

export function DialogHeading({ icon, tone, title }: { icon: IconName; tone: Tone; title: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className={`grid size-12 shrink-0 place-items-center rounded-pill ${BADGE[tone]}`}>
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="self-center font-display text-xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

export function CancelButton({ onClick, label = "Cancel" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} autoFocus className={CANCEL}>
      {label}
    </button>
  );
}

export function ConfirmButton({ label, pendingLabel, tone }: { label: string; pendingLabel: string; tone: Tone }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-11 items-center justify-center rounded-pill px-5 text-sm font-semibold text-ink-inverse transition disabled:opacity-50 ${CONFIRM[tone]}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

type ConfirmActionProps = {
  /** The small button on the page. */
  label: string;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  tone: Tone;
  icon: IconName;
  action: (form: FormData) => Promise<void>;
  /** Sent with the form, such as the id of what's being changed. */
  fields: Record<string, string>;
  /** What will happen, in plain words. */
  children: ReactNode;
};

/** Anything that can't be taken back with one click asks first, and Cancel is the safe default. */
export function ConfirmAction({ label, title, confirmLabel, pendingLabel, tone, icon, action, fields, children }: ConfirmActionProps) {
  const dialog = useDialog();
  return (
    <>
      <button
        type="button"
        onClick={dialog.open}
        className={`rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold transition hover:bg-border ${tone === "danger" ? "text-blocked" : "text-ink"}`}
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref}>
        <DialogHeading icon={icon} tone={tone} title={title} />
        <div className="mt-4 text-sm text-ink-muted">{children}</div>
        <form
          action={async (form) => {
            await action(form);
            dialog.close();
          }}
          className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
        >
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <CancelButton onClick={dialog.close} />
          <ConfirmButton label={confirmLabel} pendingLabel={pendingLabel} tone={tone} />
        </form>
      </Dialog>
    </>
  );
}
