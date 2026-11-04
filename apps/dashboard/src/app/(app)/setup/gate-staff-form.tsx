"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Field, FormProblem } from "@/components/form";
import { Icon } from "@/components/icon";

import { addGateUser, siteChoices, type GateStaffState, type SiteChoice } from "./actions";

const START: GateStaffState = { problem: null, saved: 0, added: null };
const SEARCH_DELAY_MS = 250;

/** Six random digits, drawn by the browser's own random source, never Math.random. */
function freshPin(): string {
  const digits = new Uint32Array(6);
  crypto.getRandomValues(digits);
  return Array.from(digits, (value) => String(value % 10)).join("");
}

/** Finds a site by name or code, for any form that starts from one. Only the first few matches show: search narrows it. */
export function SitePicker({ onPick, label = "Which site?" }: { onPick: (site: SiteChoice) => void; label?: string }) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ sites: SiteChoice[]; problem: string | null } | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        siteChoices(search).then(
          (next) => {
            if (current) setFound(next);
          },
          () => {
            if (current) setFound({ sites: [], problem: "That didn't load. Check your connection and try again." });
          },
        );
      },
      search ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a site name or code" autoFocus autoComplete="off" />
      {found?.problem ? <FormProblem message={found.problem} /> : null}
      {found === null ? <p className="text-sm text-ink-muted">Loading…</p> : null}
      {found && !found.problem && found.sites.length === 0 ? <p className="text-sm text-ink-muted">No site matches that.</p> : null}
      {found && found.sites.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {found.sites.map((site) => (
            <li key={site.id}>
              <button type="button" onClick={() => onPick(site)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{site.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{site.detail}</span>
                </span>
                <Icon name="chevron-right" className="size-4 shrink-0 text-ink-subtle" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The form itself. After each save it clears for the next person and says who was added, with their PIN to hand over. */
function GateStaffForm({ site, onChangeSite, onClose }: { site: SiteChoice; onChangeSite: (() => void) | null; onClose: () => void }) {
  const [state, action, pending] = useActionState(addGateUser, START);
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"guard" | "supervisor">("guard");
  const [handedOver, setHandedOver] = useState<{ name: string; pin: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastPin = useRef("");

  useEffect(() => {
    if (!state.saved || !state.added) return;
    setHandedOver({ name: state.added, pin: lastPin.current });
    formRef.current?.reset();
    setPin("");
    formRef.current?.querySelector<HTMLInputElement>("input[name=firstName]")?.focus();
  }, [state.added, state.saved]);

  // Sent by hand because React empties a form once its action finishes, which would wipe what was typed when it's refused.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    lastPin.current = pin;
    startTransition(() => action(form));
  };

  return (
    <>
      <DialogHeading icon="guard" tone="neutral" title="Add gate staff" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-4 py-2.5 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-semibold">{site.name}</span>
          {site.detail ? <span className="text-ink-muted">{` · ${site.detail}`}</span> : null}
        </span>
        {onChangeSite ? (
          <button type="button" onClick={onChangeSite} className="text-xs font-semibold text-brand hover:underline">
            Change site
          </button>
        ) : null}
      </div>

      {handedOver ? (
        <div role="status" className="mt-4 rounded-md bg-clear-soft px-4 py-3 text-sm">
          <p className="font-semibold">{`${handedOver.name} is added`}</p>
          <p className="text-ink-muted">
            {`Their PIN is `}
            <span className="font-mono text-base font-semibold text-ink">{handedOver.pin}</span>
            {`. Give it to them privately. They can sign in once the handheld syncs, within a minute.`}
          </p>
        </div>
      ) : null}

      <form ref={formRef} onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <FormProblem message={state.problem} />
        <input type="hidden" name="orgId" value={site.orgId} />
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="role" value={role} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" name="firstName" autoComplete="off" autoFocus required />
          <Field label="Surname" name="lastName" autoComplete="off" required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee number" name="employeeNumber" inputMode="numeric" autoComplete="off" required />
          <div className="flex flex-col gap-1.5">
            <Field
              label="6-digit PIN"
              name="pin"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <button type="button" onClick={() => setPin(freshPin())} className="self-start text-xs font-semibold text-brand hover:underline">
              Make a PIN
            </button>
          </div>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Role">
          {(["guard", "supervisor"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={role === option}
              onClick={() => setRole(option)}
              className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-semibold transition ${role === option ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
            >
              {option === "guard" ? "Guard" : "Supervisor (can override)"}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <CancelButton onClick={onClose} label={handedOver ? "Done" : "Cancel"} />
          <ConfirmButton label={handedOver ? "Add the next one" : "Add to the gate"} pendingLabel="Adding…" tone="neutral" pending={pending} />
        </div>
      </form>
    </>
  );
}

/**
 * Adding gate staff from anywhere. On a site's page the site is already chosen; on People it starts by finding the site.
 * The page catches up when the popup closes, so the PIN just added can't vanish under it.
 */
export function AddGateStaffButton({ site, compact = false }: { site?: SiteChoice; compact?: boolean }) {
  const dialog = useDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<SiteChoice | null>(site ?? null);
  const close = () => {
    setOpen(false);
    setChosen(site ?? null);
    router.refresh();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.open();
        }}
        className={
          compact
            ? "shrink-0 rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border"
            : "inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink"
        }
      >
        Add gate staff
      </button>
      <Dialog dialogRef={dialog.ref} onClose={close}>
        {open ? (
          chosen ? (
            <GateStaffForm site={chosen} onChangeSite={site ? null : () => setChosen(null)} onClose={dialog.close} />
          ) : (
            <>
              <DialogHeading icon="guard" tone="neutral" title="Add gate staff" />
              <div className="mt-5">
                <SitePicker onPick={setChosen} />
              </div>
              <div className="mt-5 flex justify-end">
                <CancelButton onClick={dialog.close} />
              </div>
            </>
          )
        ) : null}
      </Dialog>
    </>
  );
}
