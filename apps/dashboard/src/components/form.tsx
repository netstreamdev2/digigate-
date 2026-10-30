"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "./icon";

const CONTROL =
  "h-12 w-full rounded-md border border-border bg-surface px-4 text-sm outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-tile-sky";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Field({ label, className = "", ...input }: FieldProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      {label}
      <input {...input} className={`${CONTROL} ${className}`} />
    </label>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode };

export function SelectField({ label, children, ...select }: SelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      {label}
      <select {...select} className={CONTROL}>
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({ label, pendingLabel, arrow = false }: { label: string; pendingLabel: string; arrow?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-brand px-6 text-sm font-semibold text-ink-inverse transition hover:bg-ink active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
      {arrow && !pending ? <Icon name="chevron-right" className="size-5 transition-transform group-hover:translate-x-0.5" /> : null}
    </button>
  );
}

export function FormProblem({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-md bg-blocked-soft px-3 py-2 text-sm font-medium text-blocked">
      {message}
    </p>
  ) : null;
}
