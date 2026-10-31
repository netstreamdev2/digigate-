import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/dialog";
import { Field, SelectField } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Breadcrumbs, ListCard, Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { adminNav } from "@/lib/nav";
import { anyColumnLike, likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { addGateUser, addPost, revokeDevice, setGateUserActive } from "../../../actions";
import { LaneChoices, PairDeviceButton } from "../../../setup-forms";

const LANE_LABELS: Record<string, string> = { vehicle: "Cars", pedestrian: "On foot" };

type Tab = "posts" | "staff" | "devices";

const asTab = (value: string): Tab => (value === "staff" || value === "devices" ? value : "posts");

function Row({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-sm text-ink-muted">{detail}</span>
      </span>
      {children}
    </li>
  );
}

type SiteIds = { org: string; client: string; site: string };

async function PostsTab({ ids, query, path }: { ids: SiteIds; query: Query; path: string }) {
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);
  const supabase = await supabaseServer();
  let list = supabase.from("posts").select("id, label, lanes", { count: "exact" }).eq("site_id", ids.site).order("created_at").range(from, to);
  if (search) list = list.ilike("label", likePattern(search));
  const { data: posts, count } = await list;
  return (
    <ListCard
      isEmpty={!posts?.length}
      empty={search ? "Nothing matches that search." : "No posts yet. Guards pick one when they start a shift."}
      footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
    >
      {posts?.map((post) => (
        <Row key={post.id} title={post.label} detail={post.lanes.map((lane) => LANE_LABELS[lane] ?? lane).join(" and ")} />
      ))}
    </ListCard>
  );
}

async function StaffTab({ ids, query, path }: { ids: SiteIds; query: Query; path: string }) {
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);
  const supabase = await supabaseServer();
  let list = supabase
    .from("gate_users")
    .select("id, employee_number, first_name, last_name, role, is_active", { count: "exact" })
    .contains("site_ids", [ids.site])
    .order("employee_number")
    .range(from, to);
  if (search) list = list.or(anyColumnLike(["first_name", "last_name", "employee_number"], search));
  const { data: people, count } = await list;
  return (
    <ListCard
      isEmpty={!people?.length}
      empty={search ? "Nothing matches that search." : "No gate staff yet."}
      footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
    >
      {people?.map((person) => {
        const name = `${person.first_name} ${person.last_name}`;
        return (
          <Row key={person.id} title={name} detail={`${person.employee_number} · ${person.role === "supervisor" ? "Supervisor" : "Guard"}`}>
            <span className="flex items-center gap-2">
              {person.is_active ? null : <StatusChip status="blocked" label="Deactivated" />}
              {person.is_active ? (
                <ConfirmAction
                  label="Deactivate"
                  title={`Deactivate ${name}?`}
                  confirmLabel="Yes, deactivate"
                  pendingLabel="Deactivating…"
                  tone="danger"
                  icon="result-warning"
                  action={setGateUserActive}
                  fields={{ id: person.id, active: "false" }}
                >
                  They can&apos;t sign in on any handheld once it next syncs. Nothing is deleted, and you can reactivate them at any time.
                </ConfirmAction>
              ) : (
                <ConfirmAction
                  label="Reactivate"
                  title={`Reactivate ${name}?`}
                  confirmLabel="Yes, reactivate"
                  pendingLabel="Reactivating…"
                  tone="neutral"
                  icon="guard"
                  action={setGateUserActive}
                  fields={{ id: person.id, active: "true" }}
                >
                  They&apos;ll be able to sign in on handhelds again after the next sync.
                </ConfirmAction>
              )}
            </span>
          </Row>
        );
      })}
    </ListCard>
  );
}

async function DevicesTab({ ids, query, path }: { ids: SiteIds; query: Query; path: string }) {
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);
  const supabase = await supabaseServer();
  let list = supabase
    .from("devices")
    .select("id, name, last_seen_at, revoked_at", { count: "exact" })
    .eq("site_id", ids.site)
    .order("paired_at", { ascending: false })
    .range(from, to);
  if (search) list = list.ilike("name", likePattern(search));
  const { data: devices, count } = await list;
  return (
    <ListCard
      isEmpty={!devices?.length}
      empty={search ? "Nothing matches that search." : "No devices yet. Pair each handheld once and it then works offline."}
      footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
    >
      {devices?.map((device) => (
        <Row
          key={device.id}
          title={device.name}
          detail={device.last_seen_at ? `Last seen ${new Date(device.last_seen_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" })}` : "Not seen yet"}
        >
          {device.revoked_at ? (
            <StatusChip status="blocked" label="Revoked" />
          ) : (
            <ConfirmAction
              label="Revoke"
              title={`Revoke ${device.name}?`}
              confirmLabel="Yes, revoke it"
              pendingLabel="Revoking…"
              tone="danger"
              icon="result-warning"
              action={revokeDevice}
              fields={{ id: device.id }}
            >
              It stops working with DigiGate, signs out whoever is on it, and wipes its guards and data the next time it connects. To use it again you&apos;d pair it with a new code.
            </ConfirmAction>
          )}
        </Row>
      ))}
    </ListCard>
  );
}

async function Site({ params, searchParams }: { params: Promise<SiteIds>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || (!user.roles.includes("super_user") && !user.roles.includes("admin"))) {
    return <NoAccess message="Setting up gates needs an administrator. Your own dashboard is on the way." />;
  }

  const ids = await params;
  const query = await searchParams;
  const tab = asTab(textParam(query, "tab"));

  const supabase = await supabaseServer();
  const [{ data: company }, { data: client }, { data: site }, posts, staff, devices] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", ids.org).maybeSingle(),
    supabase.from("clients").select("name").eq("id", ids.client).maybeSingle(),
    supabase.from("sites").select("name").eq("id", ids.site).eq("client_id", ids.client).maybeSingle(),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("site_id", ids.site),
    supabase.from("gate_users").select("id", { count: "exact", head: true }).contains("site_ids", [ids.site]),
    supabase.from("devices").select("id", { count: "exact", head: true }).eq("site_id", ids.site),
  ]);
  if (!company || !client || !site) notFound();

  const base = `/setup/${ids.org}/${ids.client}/${ids.site}`;
  const crumbs = [{ label: company.name, href: `/setup/${ids.org}` }, { label: client.name, href: `/setup/${ids.org}/${ids.client}` }, { label: site.name }];
  const fields = { orgId: ids.org, siteId: ids.site };

  return (
    <AppShell
      nav={adminNav("setup")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow={<Breadcrumbs items={user.roles.includes("super_user") ? [{ label: "Security companies", href: "/setup" }, ...crumbs] : crumbs} />}
      title={site.name}
      plain
      chips={
        <div className="flex w-full flex-col gap-4">
          <Tabs
            items={[
              { label: "Posts", href: base, active: tab === "posts", count: posts.count ?? 0 },
              { label: "Gate staff", href: `${base}?tab=staff`, active: tab === "staff", count: staff.count ?? 0 },
              { label: "Devices", href: `${base}?tab=devices`, active: tab === "devices", count: devices.count ?? 0 },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox key={tab} placeholder={tab === "posts" ? "Search posts" : tab === "staff" ? "Search name or employee number" : "Search devices"} />
            {tab === "posts" ? (
              <FormDialog label="Add post" title="Add a post" icon="sites" submitLabel="Add post" pendingLabel="Adding…" action={addPost} fields={fields}>
                <Field label="Post name" name="label" placeholder="Back Gate" autoFocus required />
                <LaneChoices />
              </FormDialog>
            ) : null}
            {tab === "staff" ? (
              <FormDialog label="Add gate staff" title="Add gate staff" icon="guard" submitLabel="Add to the gate" pendingLabel="Adding…" action={addGateUser} fields={fields}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First name" name="firstName" autoComplete="off" autoFocus required />
                  <Field label="Surname" name="lastName" autoComplete="off" required />
                  <Field label="Employee number" name="employeeNumber" inputMode="numeric" autoComplete="off" required />
                  <Field label="6-digit gate PIN" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" required />
                </div>
                <SelectField label="Role" name="role" defaultValue="guard">
                  <option value="guard">Guard</option>
                  <option value="supervisor">Supervisor (can override)</option>
                </SelectField>
              </FormDialog>
            ) : null}
            {tab === "devices" ? <PairDeviceButton orgId={ids.org} siteId={ids.site} /> : null}
          </div>
        </div>
      }
    >
      {tab === "posts" ? <PostsTab ids={ids} query={query} path={base} /> : null}
      {tab === "staff" ? <StaffTab ids={ids} query={query} path={base} /> : null}
      {tab === "devices" ? <DevicesTab ids={ids} query={query} path={base} /> : null}
    </AppShell>
  );
}

export default function SitePage({ params, searchParams }: PageProps<"/setup/[org]/[client]/[site]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Site params={params} searchParams={searchParams} />
    </Suspense>
  );
}
