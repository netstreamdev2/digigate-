"use client";

import { useEffect, useState, useTransition } from "react";

import { CancelButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Icon } from "@/components/icon";

import { findStaffForPin, resetGatePin, type PinResetResult, type StaffMatch } from "./pin-actions";

/*
 * For a guard who forgot their PIN, usually at night: find them, reset it, and read the new PIN out to them. The new
 * PIN shows once, here, and works on their handheld within a minute (the next sync). Each reset is in the audit log.
 */

const SEARCH_DELAY_MS = 250;

const TRIGGER = {
  primary: "inline-flex h-11 shrink-0 items-center gap-2 rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink",
  quiet: "inline-flex h-11 shrink-0 items-center gap-2 rounded-pill bg-surface-muted px-5 text-sm font-semibold text-ink transition hover:bg-border",
} as const;

type Props = {
  /** A guard already known (their own page): skip the search. */
  guard?: StaffMatch;
  look?: keyof typeof TRIGGER;
};

export function ResetPinButton({ guard, look = "quiet" }: Props) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.open();
        }}
        className={TRIGGER[look]}
      >
        <Icon name="lock" className="size-4" />
        {guard ? "Reset PIN" : "Reset a PIN"}
      </button>
      <Dialog dialogRef={dialog.ref} onClose={() => setOpen(false)}>
        {open ? <ResetPin start={guard ?? null} onClose={dialog.close} /> : null}
      </Dialog>
    </>
  );
}

function ResetPin({ start, onClose }: { start: StaffMatch | null; onClose: () => void }) {
  const [chosen, setChosen] = useState<StaffMatch | null>(start);
  const [result, setResult] = useState<PinResetResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <>
        <DialogHeading icon="check" tone="neutral" title={`New PIN for ${result.name}`} />
        <p className="mt-5 rounded-lg bg-tile-mint px-5 py-6 text-center font-mono text-4xl font-bold tracking-[0.35em] text-ink" aria-label={`New PIN ${result.pin.split("").join(" ")}`}>
          {result.pin}
        </p>
        <ul className="mt-4 flex flex-col gap-1.5 text-sm text-ink-muted">
          <li>Give it to them privately: read it out, don&apos;t send it in a group.</li>
          <li>It works on their handheld within a minute, once it syncs. Their old PIN no longer works.</li>
          <li>This is the only time it&apos;s shown. If it&apos;s lost, reset it again.</li>
        </ul>
        <div className="mt-6 flex justify-end">
          <CancelButton onClick={onClose} label="Done" />
        </div>
      </>
    );
  }

  if (chosen) {
    return (
      <>
        <DialogHeading icon="lock" tone="neutral" title={`Reset ${chosen.name}'s PIN?`} />
        <p className="mt-3 text-sm text-ink-muted">
          {`${chosen.role === "supervisor" ? "Supervisor" : "Guard"} ${chosen.employeeNumber} · ${chosen.company}. They get a new 6-digit PIN and their old one stops working. Only reset it for the person themselves.`}
        </p>
        {result && !result.ok ? (
          <p role="alert" className="mt-4 rounded-md bg-blocked-soft px-4 py-3 text-sm text-blocked">
            {result.problem}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {start ? <CancelButton onClick={onClose} /> : <CancelButton onClick={() => setChosen(null)} label="Back" />}
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => setResult(await resetGatePin(chosen.id, chosen.name)))}
            className="inline-flex h-11 items-center justify-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink disabled:opacity-60"
          >
            {pending ? "Resetting…" : "Reset PIN"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeading icon="lock" tone="neutral" title="Reset a PIN" />
      <p className="mt-3 text-sm text-ink-muted">For a guard or supervisor who forgot theirs. Find them by employee number or name.</p>
      <StaffSearch onPick={setChosen} />
      <div className="mt-6 flex justify-end">
        <CancelButton onClick={onClose} />
      </div>
    </>
  );
}

function StaffSearch({ onPick }: { onPick: (person: StaffMatch) => void }) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ for: string; staff: StaffMatch[]; problem: string | null } | null>(null);

  useEffect(() => {
    const text = search.trim();
    if (text.length < 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      findStaffForPin(text).then(
        (answer) => {
          if (current) setFound({ for: text, ...answer });
        },
        () => {
          if (current) setFound({ for: text, staff: [], problem: "Couldn't search just now. Try again." });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const text = search.trim();
  const answer = found && found.for === text ? found : null;

  return (
    <div className="mt-5">
      <label className="relative block">
        <span className="sr-only">Employee number or name</span>
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Employee number or name"
          autoComplete="off"
          className="h-12 w-full rounded-md border border-border bg-surface pl-10 pr-4 text-sm outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-tile-sky"
        />
      </label>
      <div className="mt-3 min-h-32">
        {text.length < 2 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Type at least two characters.</p>
        ) : answer === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Searching…</p>
        ) : answer.problem ? (
          <p role="alert" className="py-6 text-center text-sm text-blocked">
            {answer.problem}
          </p>
        ) : answer.staff.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Nobody matches. Check the number, or ask an admin to add them.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {answer.staff.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onPick(person)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{person.name}</span>
                    <span className="block truncate text-xs text-ink-muted">{`${person.employeeNumber} · ${person.role === "supervisor" ? "Supervisor" : "Guard"} · ${person.company}`}</span>
                  </span>
                  <Icon name="chevron-right" className="size-4 shrink-0 text-ink-subtle" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
