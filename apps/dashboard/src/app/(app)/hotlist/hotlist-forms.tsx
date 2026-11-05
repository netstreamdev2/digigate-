"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Field, FormProblem, TextAreaField } from "@/components/form";
import { Icon, type IconName } from "@/components/icon";
import { SiteFirstDialog } from "@/components/site-first-dialog";
import { FORM_START } from "@/lib/form-state";

import type { SiteChoice } from "../setup/actions";
import { SitePicker } from "../setup/gate-staff-form";
import { addToHotlist } from "./actions";

type Kind = "person" | "plate" | "vin";
type Company = { id: string; name: string };

const KINDS: readonly { kind: Kind; label: string; icon: IconName; field: string; placeholder: string }[] = [
  { kind: "person", label: "A person", icon: "user", field: "SA ID number", placeholder: "13 digits" },
  { kind: "plate", label: "A plate", icon: "number-plate", field: "Number plate", placeholder: "ND 123-456" },
  { kind: "vin", label: "A VIN", icon: "vehicle", field: "VIN", placeholder: "17 letters and numbers" },
];

const BUTTON = "inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse shadow-floating transition hover:bg-ink";

function Choice({ chosen, onChoose, icon, children }: { chosen: boolean; onChoose: () => void; icon?: IconName; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={`inline-flex h-11 items-center gap-2 rounded-pill px-4 text-sm font-semibold transition ${chosen ? "bg-brand text-ink-inverse shadow-floating" : "bg-surface-muted text-ink hover:bg-border"}`}
    >
      {icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </button>
  );
}

/** The entry itself. The company is known already; the site is asked for only when it's for one site. */
function HotlistForm({ company, presetSite, close }: { company: Company; presetSite: SiteChoice | null; close: () => void }) {
  const [state, action, pending] = useActionState(addToHotlist, FORM_START);
  const [kind, setKind] = useState<Kind>("person");
  const [scope, setScope] = useState<"company" | "site">("company");
  const [site, setSite] = useState<SiteChoice | null>(presetSite);
  const shown = KINDS.find((option) => option.kind === kind) ?? KINDS[0];

  useEffect(() => {
    if (state.saved) close();
  }, [state.saved, close]);

  // Sent by hand because React empties a form once its action finishes, which would wipe what was typed when it's refused.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };

  const needsSite = scope === "site" && !site;

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={company.id} />
      <input type="hidden" name="siteId" value={site?.id ?? ""} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="scope" value={scope} />

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What to stop">
        {KINDS.map((option) => (
          <Choice key={option.kind} chosen={kind === option.kind} onChoose={() => setKind(option.kind)} icon={option.icon}>
            {option.label}
          </Choice>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          key={kind}
          label={shown?.field ?? "SA ID number"}
          name="value"
          placeholder={shown?.placeholder}
          inputMode={kind === "person" ? "numeric" : "text"}
          autoComplete="off"
          autoFocus
          required
        />
        {kind === "person" ? <Field label="Their name, as on their ID" name="name" autoComplete="off" required /> : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Where to stop them</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where to stop them">
          <Choice chosen={scope === "company"} onChoose={() => setScope("company")}>
            {`Every ${company.name} site`}
          </Choice>
          <Choice chosen={scope === "site"} onChoose={() => setScope("site")}>
            {site ? `Only ${site.name}` : "Only one site"}
          </Choice>
        </div>
        {scope === "site" && site ? (
          <button type="button" onClick={() => setSite(null)} className="w-fit text-xs font-semibold text-brand hover:underline">
            Pick another site
          </button>
        ) : null}
        {needsSite ? <SitePicker onPick={setSite} label={`Which ${company.name} site?`} orgId={company.id} autoFocus={false} /> : null}
      </div>

      <TextAreaField label="Why (the control room sees this, the guard doesn't)" name="reason" maxLength={500} placeholder="Reported stolen, SAPS case 12/11/2026" required />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="What the guard should do" name="guardNote" maxLength={200} defaultValue="Don't let them through, and call your supervisor." required />
        <Field label="Until (leave empty for no end)" name="until" type="date" />
      </div>
      <p className="-mt-2 text-xs text-ink-muted">
        Handhelds pick it up at their next sync and stop a match even with no signal. An ID number is kept only as the key the gates match on, with its last four digits to show.
      </p>

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <CancelButton onClick={close} />
        {needsSite ? null : <ConfirmButton label="Put on the hotlist" pendingLabel="Adding…" tone="danger" pending={pending} />}
      </div>
    </form>
  );
}

/** Inside a company the form opens straight away; across every company, picking a site first says whose list it is. */
export function AddToHotlistButton({ company = null }: { company?: Company | null }) {
  const dialog = useDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!company) {
    return (
      <SiteFirstDialog label="Add to the hotlist" title="Add to the hotlist" icon="watchlist" pickLabel="Which site's company is it for?">
        {(site, { close }) => <HotlistForm company={{ id: site.orgId, name: site.detail || "this company's" }} presetSite={site} close={close} />}
      </SiteFirstDialog>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.open();
        }}
        className={BUTTON}
      >
        Add to the hotlist
      </button>
      <Dialog
        dialogRef={dialog.ref}
        wide
        onClose={() => {
          setOpen(false);
          router.refresh();
        }}
      >
        <DialogHeading icon="watchlist" tone="neutral" title={`Add to ${company.name}'s hotlist`} />
        {open ? <HotlistForm company={company} presetSite={null} close={dialog.close} /> : null}
      </Dialog>
    </>
  );
}
