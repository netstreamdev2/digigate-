import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import type { NavItem } from "@/components/sidebar";
import { StatusChip } from "@/components/status-chip";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { revokeDevice, setGateUserActive } from "./actions";
import { ClientForm, GateUserForm, OrganisationForm, PairingForm, PostForm, SiteForm } from "./setup-forms";

const NAV: readonly NavItem[] = [{ label: "Set up", icon: "overview-filled", href: "/setup", active: true }];

const LANE_LABELS: Record<string, string> = { vehicle: "Cars", pedestrian: "On foot" };

function PickList({ items, selected, hrefFor }: { items: readonly { id: string; name: string }[]; selected: string | null; hrefFor: (id: string) => string }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={hrefFor(item.id)}
          className={`inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold ${item.id === selected ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink"}`}
        >
          {item.name}
        </Link>
      ))}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="mb-5 divide-y divide-border">{children}</ul>;
}

function NoAccess() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <p className="max-w-md text-center text-ink-muted">Setting up gates needs an administrator. Ask yours if you need something changed here.</p>
    </main>
  );
}

async function Setup({ searchParams }: { searchParams: PageProps<"/setup">["searchParams"] }) {
  const user = await currentUser();
  const isSuperUser = user?.roles.includes("super_user") ?? false;
  if (!user || (!isSuperUser && !user.roles.includes("admin"))) return <NoAccess />;

  const query = await searchParams;
  const supabase = await supabaseServer();

  const { data: organisations } = await supabase.from("organisations").select("id, name").order("name");
  const orgId = (typeof query.org === "string" ? query.org : null) ?? organisations?.[0]?.id ?? null;
  const { data: clients } = orgId ? await supabase.from("clients").select("id, name").eq("org_id", orgId).order("name") : { data: [] };
  const clientId = (typeof query.client === "string" ? query.client : null) ?? clients?.[0]?.id ?? null;
  const { data: sites } = clientId ? await supabase.from("sites").select("id, name, site_type").eq("client_id", clientId).order("name") : { data: [] };
  const siteId = (typeof query.site === "string" ? query.site : null) ?? sites?.[0]?.id ?? null;

  const { data: posts } = siteId ? await supabase.from("posts").select("id, label, lanes").eq("site_id", siteId).order("created_at") : { data: [] };
  const { data: gateUsers } = siteId
    ? await supabase
        .from("gate_users")
        .select("id, employee_number, first_name, last_name, role, is_active")
        .contains("site_ids", [siteId])
        .order("employee_number")
    : { data: [] };
  const { data: devices } = siteId
    ? await supabase.from("devices").select("id, name, paired_at, last_seen_at, revoked_at").eq("site_id", siteId).order("paired_at", { ascending: false })
    : { data: [] };

  return (
    <AppShell nav={NAV} user={{ name: user.fullName, role: roleLabel(user) }} eyebrow="Getting a gate running" title="Set up" plain>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="1. Security company" subtitle="Rents DigiGate and employs the guards">
          {organisations?.length ? (
            <PickList items={organisations} selected={orgId} hrefFor={(id) => `/setup?org=${id}`} />
          ) : (
            <p className="mb-5 text-sm text-ink-muted">No security companies yet. Add the first one.</p>
          )}
          {isSuperUser ? <OrganisationForm /> : null}
        </Card>

        {orgId ? (
          <Card title="2. Client" subtitle="Who hired them. Records stay with the client, even if they change company.">
            {clients?.length ? <PickList items={clients} selected={clientId} hrefFor={(id) => `/setup?org=${orgId}&client=${id}`} /> : null}
            <ClientForm orgId={orgId} />
          </Card>
        ) : null}

        {orgId && clientId ? (
          <Card title="3. Site" subtitle="One place with gates. A client can have several.">
            {sites?.length ? <PickList items={sites} selected={siteId} hrefFor={(id) => `/setup?org=${orgId}&client=${clientId}&site=${id}`} /> : null}
            <SiteForm orgId={orgId} clientId={clientId} />
          </Card>
        ) : null}

        {orgId && siteId ? (
          <>
            <Card title="4. Posts" subtitle="Where guards stand. Guards pick one when they start a shift.">
              {posts?.length ? (
                <Rows>
                  {posts.map((post) => (
                    <li key={post.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="font-medium">{post.label}</span>
                      <span className="text-ink-muted">{post.lanes.map((lane) => LANE_LABELS[lane] ?? lane).join(" and ")}</span>
                    </li>
                  ))}
                </Rows>
              ) : null}
              <PostForm orgId={orgId} siteId={siteId} />
            </Card>

            <Card title="5. Gate staff" subtitle="Guards and supervisors sign in on the handheld with these details.">
              {gateUsers?.length ? (
                <Rows>
                  {gateUsers.map((person) => (
                    <li key={person.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{`${person.first_name} ${person.last_name}`}</span>
                        <span className="block text-ink-muted">{`${person.employee_number} · ${person.role === "supervisor" ? "Supervisor" : "Guard"}`}</span>
                      </span>
                      <form action={setGateUserActive}>
                        <input type="hidden" name="id" value={person.id} />
                        <input type="hidden" name="active" value={String(!person.is_active)} />
                        <button type="submit" className="rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold">
                          {person.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    </li>
                  ))}
                </Rows>
              ) : null}
              <GateUserForm orgId={orgId} siteId={siteId} />
            </Card>

            <Card title="6. Devices" subtitle="Pair each handheld once. It then works offline.">
              {devices?.length ? (
                <Rows>
                  {devices.map((device) => (
                    <li key={device.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="font-medium">{device.name}</span>
                      {device.revoked_at ? (
                        <StatusChip status="blocked" label="Revoked" />
                      ) : (
                        <form action={revokeDevice}>
                          <input type="hidden" name="id" value={device.id} />
                          <button type="submit" className="rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold">
                            Revoke
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </Rows>
              ) : null}
              <PairingForm orgId={orgId} siteId={siteId} />
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Setup searchParams={searchParams} />
    </Suspense>
  );
}
