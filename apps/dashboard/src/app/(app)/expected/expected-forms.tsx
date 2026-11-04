"use client";

import { visitTypesFor } from "@digigate/core";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { CancelButton, ConfirmButton } from "@/components/dialog";
import { Field, FormProblem, SelectField } from "@/components/form";
import { SiteFirstDialog } from "@/components/site-first-dialog";
import { FORM_START } from "@/lib/form-state";

import type { SiteChoice } from "../setup/actions";
import { bookVisitor } from "./actions";

/** Today at the site, as the date picker writes it. */
const siteToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());

function BookingForm({ site, close }: { site: SiteChoice; close: () => void }) {
  const [state, action, pending] = useActionState(bookVisitor, FORM_START);
  const [from, setFrom] = useState(siteToday);
  const visitTypes = visitTypesFor(site.siteType);

  useEffect(() => {
    if (state.saved) close();
  }, [state.saved, close]);

  // Sent by hand because React empties a form once its action finishes, which would wipe what was typed when it's refused.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={site.orgId} />
      <input type="hidden" name="siteId" value={site.id} />

      <Field label="Their name, as on their ID" name="name" autoComplete="off" autoFocus required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SA ID number" name="idNumber" inputMode="numeric" placeholder="13 digits" autoComplete="off" />
        <Field label="Or the car's plate" name="plate" placeholder="ND 123-456" autoComplete="off" />
      </div>
      <p className="-mt-2 text-xs text-ink-muted">
        Either is enough, both is surer. The gate knows them when their licence or ID is scanned, or the car&apos;s disc. The ID number is kept only as the key the gates match on.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="From" name="from" type="date" value={from} min={siteToday()} onChange={(event) => setFrom(event.target.value)} required />
        <Field label="Until (same day if empty)" name="until" type="date" min={from} />
        <SelectField label="Kind of visit" name="visitType" defaultValue="">
          <option value="">Leave to the guard</option>
          {visitTypes.map((type) => (
            <option key={type.code} value={type.code}>
              {type.label}
            </option>
          ))}
        </SelectField>
      </div>
      <Field label="A note for the guard (optional)" name="note" maxLength={200} placeholder="Fixing the lifts in block C" />

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <CancelButton onClick={close} />
        <ConfirmButton label="Book them in" pendingLabel="Booking…" tone="neutral" pending={pending} />
      </div>
    </form>
  );
}

/** Given a company, only its sites are offered. */
export function BookVisitorButton({ orgId = "" }: { orgId?: string }) {
  return (
    <SiteFirstDialog label="Book a visitor" title="Book a visitor in" icon="invite" pickLabel="Which site are they coming to?" orgId={orgId}>
      {(site, { close }) => <BookingForm site={site} close={close} />}
    </SiteFirstDialog>
  );
}
