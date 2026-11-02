import Link from "next/link";
import type { ReactNode } from "react";

import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Icon } from "@/components/icon";
import { counted, must } from "@/lib/reads";
import { supabaseServer } from "@/lib/supabase/server";

import { AddPersonButton } from "../../people/people-forms";
import { addClient } from "../actions";
import { PairDeviceButton } from "../pair-device";

/** `keep` leaves the action in place once the step is done, for one that can be repeated and has a popup worth keeping open. */
type Step = { title: string; done: boolean; detail: string; action: ReactNode; keep?: boolean };

const STEP_LINK = "inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function StepLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={STEP_LINK}>
      {label}
      <Icon name="chevron-right" className="size-3.5" />
    </Link>
  );
}

/**
 * What a company still needs before its first gate runs, in the order it has to happen, each with the way to do it.
 * It goes away once everything is done.
 */
export async function CompanyChecklist({ company }: { company: { id: string; name: string } }) {
  const supabase = await supabaseServer();
  const head = { count: "exact", head: true } as const;
  const [admins, clients, sites, posts, located, staff, devices] = await Promise.all([
    supabase.from("profiles").select("id", head).eq("org_id", company.id).contains("roles", ["admin"]).eq("is_active", true),
    supabase.from("clients").select("id, name", { count: "exact" }).eq("org_id", company.id).order("created_at").limit(1),
    supabase.from("sites").select("id, name, client_id, clients(name)", { count: "exact" }).eq("org_id", company.id).order("created_at").limit(1),
    supabase.from("posts").select("id", head).eq("org_id", company.id).eq("is_active", true),
    supabase.from("posts").select("id", head).eq("org_id", company.id).eq("is_active", true).not("latitude", "is", null),
    supabase.from("gate_users").select("id", head).eq("org_id", company.id).eq("is_active", true),
    supabase.from("devices").select("id", head).eq("org_id", company.id).is("revoked_at", null),
  ]);

  const counts = {
    admins: counted(admins),
    clients: counted(clients),
    sites: counted(sites),
    posts: counted(posts),
    located: counted(located),
    staff: counted(staff),
    devices: counted(devices),
  };
  const [firstClient] = must(clients);
  const [firstSite] = must(sites);
  const sitePath = firstSite ? `/setup/${company.id}/${firstSite.client_id}/${firstSite.id}` : null;
  const afterSite = "Comes once there's a site.";

  const steps: Step[] = [
    { title: "Company added", done: true, detail: `${company.name} is on DigiGate.`, action: null },
    {
      title: "Their administrator",
      done: counts.admins > 0,
      detail:
        counts.admins > 0
          ? `${plural(counts.admins, "administrator login")}.`
          : `Give the person running ${company.name} a login. They set up their authenticator and choose their own password.`,
      action: <AddPersonButton companies={[company]} role="admin" label={counts.admins > 0 ? "Add another" : "Add administrator"} compact />,
      keep: true,
    },
    {
      title: "First client",
      done: counts.clients > 0,
      detail: counts.clients > 0 ? `${plural(counts.clients, "client")}.` : "The hospital or estate they guard. Its records stay with it, even if it changes security company.",
      action: (
        <FormDialog compact label="Add client" title={`Add a client to ${company.name}`} icon="sites" submitLabel="Add client" pendingLabel="Adding…" action={addClient} fields={{ orgId: company.id }}>
          <Field label="Client name" name="name" placeholder="A hospital, an estate" autoFocus required />
        </FormDialog>
      ),
    },
    {
      title: "First site",
      done: counts.sites > 0,
      detail: counts.sites > 0 ? `${plural(counts.sites, "site")}.` : firstClient ? `Where the gates are. Add it inside ${firstClient.name}.` : "Comes once there's a client.",
      action: firstClient ? <StepLink href={`/setup/${company.id}/${firstClient.id}`} label={`Open ${firstClient.name}`} /> : null,
    },
    {
      title: "Posts, with their locations",
      done: counts.posts > 0,
      detail:
        counts.posts > 0
          ? `${plural(counts.posts, "post")}${counts.located < counts.posts ? `, ${counts.posts - counts.located} still without a location, so their geofence is off` : ", every one with its location"}.`
          : firstSite
            ? "Each gate a guard stands at. Set where it is, so a guard who walks off is noticed."
            : afterSite,
      action: sitePath ? <StepLink href={sitePath} label={counts.posts > 0 ? "Open posts" : "Add posts"} /> : null,
    },
    {
      title: "Gate staff",
      done: counts.staff > 0,
      detail:
        counts.staff > 0
          ? `${counts.staff} on the gate staff list.`
          : firstSite
            ? "Guards and supervisors, each with an employee number and a 6-digit PIN."
            : afterSite,
      action: sitePath ? <StepLink href={`${sitePath}?tab=staff`} label="Add gate staff" /> : null,
    },
    {
      title: "A paired handheld",
      done: counts.devices > 0,
      detail: counts.devices > 0 ? `${plural(counts.devices, "handheld")} working.` : firstSite ? "Pair the DT50 at the gate. Guards then sign in on it with their employee number and PIN." : afterSite,
      action:
        firstSite && firstClient ? (
          <PairDeviceButton
            compact
            label={counts.devices > 0 ? "Pair another" : "Pair a device"}
            place={{
              company,
              client: { id: firstSite.client_id, name: firstSite.clients?.name ?? firstClient.name },
              site: { id: firstSite.id, name: firstSite.name },
            }}
          />
        ) : null,
      keep: true,
    },
  ];

  const finished = steps.filter((step) => step.done).length;
  if (finished === steps.length) return null;
  const next = steps.findIndex((step) => !step.done);

  return (
    <section aria-label={`Get ${company.name} ready`} className="mt-6 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      <header className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">{`Get ${company.name} ready`}</h2>
          <p className="text-sm font-medium text-ink-muted">{`${finished} of ${steps.length} done`}</p>
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">Work down the list. When it&apos;s done, guards can start their first shift.</p>
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {steps.map((step) => (
            <span key={step.title} className={`h-1.5 flex-1 rounded-pill ${step.done ? "bg-clear" : "bg-surface-muted"}`} />
          ))}
        </div>
      </header>
      <ol className="divide-y divide-border border-t border-border">
        {steps.map((step, index) => {
          const isNext = index === next;
          return (
            <li key={step.title} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 ${isNext ? "bg-tile-sky/50" : ""}`}>
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-pill text-sm font-semibold ${
                  step.done ? "bg-clear-soft text-clear" : isNext ? "bg-brand text-ink-inverse" : "bg-surface-muted text-ink-muted"
                }`}
              >
                {step.done ? <Icon name="check" className="size-4" /> : index + 1}
                <span className="sr-only">{step.done ? " done" : " to do"}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${step.done ? "text-ink-muted" : ""}`}>{step.title}</span>
                <span className="block text-sm text-ink-muted">{step.detail}</span>
              </span>
              {step.action && (!step.done || step.keep) ? <span className="ml-12 sm:ml-0">{step.action}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
