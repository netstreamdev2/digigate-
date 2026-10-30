"use client";

import { useActionState } from "react";

import { Field, FormProblem, SelectField, SubmitButton } from "@/components/form";
import { QrImage } from "@/components/qr-image";

import { addClient, addGateUser, addOrganisation, addPost, addSite, createPairingCode, type FormState, type PairingState } from "./actions";

const START: FormState = { problem: null };
const NO_CODE: PairingState = { problem: null, code: null, qr: null, expiresAt: null };

const ROW = "flex flex-col gap-3";

export function OrganisationForm() {
  const [state, action] = useActionState(addOrganisation, START);
  return (
    <form action={action} className={ROW}>
      <FormProblem message={state.problem} />
      <Field label="Company name" name="name" required />
      <SubmitButton label="Add security company" pendingLabel="Adding…" />
    </form>
  );
}

export function ClientForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState(addClient, START);
  return (
    <form action={action} className={ROW}>
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={orgId} />
      <Field label="Client name" name="name" placeholder="A hospital, an estate" required />
      <SubmitButton label="Add client" pendingLabel="Adding…" />
    </form>
  );
}

export function SiteForm({ orgId, clientId }: { orgId: string; clientId: string }) {
  const [state, action] = useActionState(addSite, START);
  return (
    <form action={action} className={ROW}>
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Site name" name="name" placeholder="Main Campus" required />
      <SelectField label="Site type" name="siteType" defaultValue="hospital">
        <option value="hospital">Hospital</option>
        <option value="estate">Residential estate</option>
      </SelectField>
      <SubmitButton label="Add site" pendingLabel="Adding…" />
    </form>
  );
}

function LaneChoice({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex h-11 flex-1 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium has-checked:border-ink has-checked:bg-tile-sky">
      <input type="checkbox" name="lanes" value={value} defaultChecked className="accent-ink" />
      {label}
    </label>
  );
}

export function PostForm({ orgId, siteId }: { orgId: string; siteId: string }) {
  const [state, action] = useActionState(addPost, START);
  return (
    <form action={action} className={ROW}>
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="siteId" value={siteId} />
      <Field label="Post name" name="label" placeholder="Back Gate" required />
      <div className="flex gap-2">
        <LaneChoice value="vehicle" label="Cars" />
        <LaneChoice value="pedestrian" label="On foot" />
      </div>
      <SubmitButton label="Add post" pendingLabel="Adding…" />
    </form>
  );
}

export function GateUserForm({ orgId, siteId }: { orgId: string; siteId: string }) {
  const [state, action] = useActionState(addGateUser, START);
  return (
    <form action={action} className={ROW}>
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="siteId" value={siteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="off" required />
        <Field label="Surname" name="lastName" autoComplete="off" required />
        <Field label="Employee number" name="employeeNumber" inputMode="numeric" autoComplete="off" required />
        <Field label="6-digit gate PIN" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" required />
      </div>
      <SelectField label="Role" name="role" defaultValue="guard">
        <option value="guard">Guard</option>
        <option value="supervisor">Supervisor (can override)</option>
      </SelectField>
      <SubmitButton label="Add to the gate" pendingLabel="Adding…" />
    </form>
  );
}

const groupCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;

export function PairingForm({ orgId, siteId }: { orgId: string; siteId: string }) {
  const [state, action] = useActionState(createPairingCode, NO_CODE);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className={ROW}>
        <FormProblem message={state.problem} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="siteId" value={siteId} />
        <Field label="Device name" name="name" placeholder="Main Gate DT50" required />
        <SubmitButton label="Show pairing code" pendingLabel="Creating…" />
      </form>
      {state.code && state.qr ? (
        <div className="flex flex-col items-center gap-2 rounded-md bg-surface-muted p-4">
          <QrImage src={state.qr} alt="Pairing QR code" />
          <p className="font-display text-2xl font-bold tracking-wide">{groupCode(state.code)}</p>
          <p className="text-center text-sm text-ink-muted">Scan this on the DT50&apos;s pairing screen. It works once and expires in 10 minutes.</p>
        </div>
      ) : null}
    </div>
  );
}
