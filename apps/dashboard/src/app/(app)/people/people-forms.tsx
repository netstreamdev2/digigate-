"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Field, FormProblem, SelectField } from "@/components/form";
import { Icon } from "@/components/icon";

import { companyOptions, createPerson, resetPassword, type CreateState, type ResetState } from "./actions";

type Named = { id: string; name: string };

const NOTHING_YET: CreateState = { problem: null, created: null };
const NO_RESET: ResetState = { problem: null, password: null };

const ROLES = [
  { value: "control_room", label: "Control room" },
  { value: "supervisor", label: "Supervisor" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrator" },
  { value: "client_viewer", label: "Site, view only" },
  { value: "host", label: "Host: invites visitors from the phone app" },
];

/** A message ready to send them, so nobody has to retype a password. A host gets the phone app's steps instead. */
function sharableMessage(login: string, password: string, host = false): string {
  if (host) {
    return [
      "Your DigiGate visitor invites login",
      "Open the DigiGate app on your phone and sign in with your mobile number or username:",
      `Username: ${login}`,
      `Temporary password: ${password}`,
      "You'll choose your own password the first time.",
    ].join("\n");
  }
  return [
    "Your DigiGate login",
    `Sign in at ${window.location.origin}`,
    `Username: ${login}`,
    `Temporary password: ${password}`,
    "You'll be asked to set up or enter your authenticator code, then choose a new password.",
  ].join("\n");
}

/** The temporary password and what the person does with it. It's only ever on screen once. */
function PasswordHandOver({ name, login, password, host = false }: { name: string; login: string; password: string; host?: boolean }) {
  const [copied, setCopied] = useState(false);
  const firstName = name.split(" ")[0] ?? name;

  const copy = async () => {
    await navigator.clipboard.writeText(sharableMessage(login, password, host));
    setCopied(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 rounded-md bg-surface-muted p-4 text-sm">
        <div>
          <dt className="text-ink-muted">Username</dt>
          <dd className="font-semibold">{login}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Temporary password</dt>
          <dd className="break-all font-mono text-lg font-semibold">{password}</dd>
        </div>
      </dl>

      <div className="text-sm">
        <p className="font-semibold">{`What ${firstName} needs to do`}</p>
        <ol className="mt-2 flex flex-col gap-2 text-ink-muted">
          {[
            "Sign in with this username and temporary password.",
            "Enter the code from their authenticator app, or set one up if this is their first time.",
            "Choose a new password of at least 12 characters.",
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-tile-sky text-xs font-semibold text-brand">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-tile-sky px-5 text-sm font-semibold text-brand transition hover:bg-tile-mint"
      >
        {copied ? <Icon name="check" className="size-4" /> : null}
        {copied ? "Copied" : "Copy login details to send"}
      </button>

      <p className="text-xs text-ink-muted">This password won&apos;t be shown again. Send it privately.</p>
    </div>
  );
}

/** `role` fixes the role, for a button that only ever adds one kind of login, such as a company's administrator. */
function PersonSteps({ companies, fixedRole, onClose, preview = false }: { companies: readonly Named[]; fixedRole?: string; onClose: () => void; preview?: boolean }) {
  const [state, action, pending] = useActionState(createPerson, NOTHING_YET);
  const [role, setRole] = useState(fixedRole ?? "control_room");
  const [orgId, setOrgId] = useState(companies[0]?.id ?? "");
  const [options, setOptions] = useState<{ clients: readonly Named[]; sites: readonly Named[] }>({ clients: [], sites: [] });

  // Only this company's clients and sites are fetched, so the form stays light however many companies there are.
  useEffect(() => {
    let current = true;
    if (orgId && role !== "technician") {
      void companyOptions(orgId).then((next) => {
        if (current) setOptions(next);
      });
    }
    return () => {
      current = false;
    };
  }, [orgId, role]);

  if (state.created) {
    return (
      <>
        <DialogHeading icon="check" tone="neutral" title="Login created" />
        <div className="mt-5">
          <PasswordHandOver name={state.created.name} login={state.created.login} password={state.created.password} host={role === "host"} />
        </div>
        <div className="mt-6 flex justify-end">
          <CancelButton onClick={onClose} label="Done" />
        </div>
      </>
    );
  }

  // Sent by hand because React empties a form once its action finishes, which would wipe what was typed when it's refused.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) return;
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };

  const fixedLabel = ROLES.find((option) => option.value === fixedRole)?.label;
  const company = companies[0]?.name ?? "";

  return (
    <>
      <DialogHeading icon="users" tone="neutral" title={role === "technician" ? "Add a DigiGate technician" : fixedLabel ? `Add ${company}'s ${fixedLabel.toLowerCase()}` : "Add a person"} />
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <FormProblem message={state.problem} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" name="fullName" autoComplete="off" autoFocus required />
          <Field label={role === "technician" ? "Work email" : "Username or email"} type={role === "technician" ? "email" : "text"} name="login" autoCapitalize="none" autoComplete="off" spellCheck={false} required />
        </div>

        {fixedRole ? (
          <input type="hidden" name="role" value={fixedRole} />
        ) : (
          <SelectField label="Role" name="role" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        )}

        {role === "technician" ? <p className="rounded-md bg-tile-sky p-4 text-sm">A DigiGate technician sees every company and can use remote control. Super users handle new companies, site licences, suspensions and handheld release.</p> : companies.length > 1 ? (
          <SelectField label="Security company" name="orgId" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="orgId" value={orgId} />
        )}

        {role === "client_viewer" ? (
          <SelectField label="Which site" name="clientId">
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </SelectField>
        ) : null}

        {role === "admin" ? <p className="text-sm text-ink-muted">Administrators cover every site of their company.</p> : null}

        {role === "host" ? (
          <>
            <Field label="Mobile number (optional)" name="phone" inputMode="tel" placeholder="082 123 4567" autoComplete="off" />
            <p className="text-sm text-ink-muted">A host only invites visitors, from the DigiGate app on their phone, with no authenticator. They sign in with this number or their username. At a hospital, who invited a visitor is never shown at the gate.</p>
          </>
        ) : null}

        {role !== "admin" && role !== "client_viewer" && role !== "technician" ? (
          <fieldset className="flex flex-col gap-1.5 text-sm font-medium">
            <legend className="mb-1.5">Which sites</legend>
            {options.sites.length ? (
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {options.sites.map((site) => (
                  <label key={site.id} className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 has-checked:border-ink has-checked:bg-tile-sky">
                    <input type="checkbox" name="siteIds" value={site.id} className="accent-ink" />
                    {site.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="font-normal text-ink-muted">This company has no sites yet. Add one under Companies.</p>
            )}
          </fieldset>
        ) : null}

        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <CancelButton onClick={onClose} />
          <ConfirmButton label={preview ? "Preview only" : "Create login"} pendingLabel="Creating…" tone="neutral" pending={pending || preview} />
        </div>
      </form>
    </>
  );
}

type AddPersonProps = { companies: readonly Named[]; role?: string; label?: string; compact?: boolean; preview?: boolean };

export function AddPersonButton({ companies, role, label = "Add a person", compact = false, preview = false }: AddPersonProps) {
  const dialog = useDialog();
  const router = useRouter();
  // Closing starts it fresh, so a temporary password never lingers behind the popup. The page catches up only then: a
  // checklist that ticked itself off while the password was showing would take the popup away with it.
  const [round, setRound] = useState(0);
  const close = () => {
    setRound(round + 1);
    router.refresh();
  };
  return (
    <>
      <button
        type="button"
        onClick={dialog.open}
        className={
          compact
            ? "shrink-0 rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border"
            : "inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink"
        }
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref} onClose={close}>
        <PersonSteps key={round} companies={companies} fixedRole={role} onClose={dialog.close} preview={preview} />
      </Dialog>
    </>
  );
}

function ResetSteps({ id, name, login, onClose }: { id: string; name: string; login: string; onClose: () => void }) {
  const [state, action] = useActionState(resetPassword, NO_RESET);
  const firstName = name.split(" ")[0] ?? name;

  if (state.password) {
    return (
      <>
        <DialogHeading icon="check" tone="neutral" title={`${firstName}'s password is reset`} />
        <div className="mt-5">
          <PasswordHandOver name={name} login={login} password={state.password} />
        </div>
        <div className="mt-6 flex justify-end">
          <CancelButton onClick={onClose} label="Done" />
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeading icon="result-warning" tone="danger" title={`Reset ${firstName}'s password?`} />
      <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-muted">
        <li>Their current password stops working straight away.</li>
        <li>You&apos;ll get a temporary password to give them.</li>
        <li>Their account, role and records stay exactly as they are.</li>
      </ul>
      <div className="mt-4">
        <FormProblem message={state.problem} />
      </div>
      <form action={action} className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <input type="hidden" name="id" value={id} />
        <CancelButton onClick={onClose} />
        <ConfirmButton label="Yes, reset password" pendingLabel="Resetting…" tone="danger" />
      </form>
    </>
  );
}

export function ResetPasswordButton({ id, name, login }: { id: string; name: string; login: string }) {
  const dialog = useDialog();
  // Closing starts it fresh, so a temporary password never lingers behind the popup.
  const [round, setRound] = useState(0);
  return (
    <>
      <button type="button" onClick={dialog.open} className="rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold transition hover:bg-border">
        Reset password
      </button>
      <Dialog dialogRef={dialog.ref} onClose={() => setRound(round + 1)}>
        <ResetSteps key={round} id={id} name={name} login={login} onClose={dialog.close} />
      </Dialog>
    </>
  );
}
