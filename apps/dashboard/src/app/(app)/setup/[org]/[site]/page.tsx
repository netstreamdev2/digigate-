import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddedNotice } from "@/components/added-notice";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/skeleton";
import { ConfirmAction } from "@/components/dialog";
import { FormDialog } from "@/components/form-dialog";
import { Breadcrumbs, ListCard, Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { anyColumnLike, likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, maybe, must } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { AccessPointFormFields } from "../../access-point-editor";
import { AccessPointList } from "../../access-point-list";
import { addAccessPoint, revokeDevice, setGateUserActive } from "../../actions";
import { AddGateStaffButton } from "../../gate-staff-form";
import { PairDeviceButton } from "../../pair-device";

type Tab = "points" | "staff" | "devices";

const asTab = (value: string): Tab => (value === "staff" || value === "devices" ? value : "points");

function Row({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{detail}</span>
      </span>
      {children}
    </li>
  );
}

type SiteIds = { org: string; site: string };

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
  const listed = await list;
  const people = must(listed);
  const count = counted(listed);
  return (
    <ListCard
      isEmpty={people.length === 0}
      empty={search ? "Nothing matches that search." : "No gate staff yet. Add the guards and supervisors who work here."}
      footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
    >
      {people.map((person) => {
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
  const listed = await list;
  const devices = must(listed);
  const count = counted(listed);
  return (
    <ListCard
      isEmpty={devices.length === 0}
      empty={search ? "Nothing matches that search." : "No devices yet. Pair each handheld once and it then works offline."}
      footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
    >
      {devices.map((device) => (
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

type SiteSummary = { code: string | null; address: string | null; latitude: number | null; radius_m: number | null; open_parking: boolean; parking_spaces: number | null };

function summaryLine(site: SiteSummary): string {
  return [
    site.code,
    site.address,
    site.open_parking ? "Open parking" : `${site.parking_spaces ?? 0} parking spaces`,
    site.latitude === null ? "No site geofence" : `Site geofence ${site.radius_m} m`,
  ]
    .filter(Boolean)
    .join(" · ");
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
  const [companyRead, siteRead, points, staff, devices] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", ids.org).maybeSingle(),
    supabase.from("sites").select("name, code, site_type, address, latitude, longitude, radius_m, open_parking, parking_spaces").eq("id", ids.site).eq("org_id", ids.org).maybeSingle(),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("site_id", ids.site),
    supabase.from("gate_users").select("id", { count: "exact", head: true }).contains("site_ids", [ids.site]),
    supabase.from("devices").select("id", { count: "exact", head: true }).eq("site_id", ids.site),
  ]);
  const company = maybe(companyRead);
  const site = maybe(siteRead);
  if (!company || !site) notFound();
  const justAdded = textParam(query, "added") === "1";
  const pointCount = points.count ?? 0;
  const near = site.latitude !== null && site.longitude !== null ? { latitude: site.latitude, longitude: site.longitude } : null;

  const base = `/setup/${ids.org}/${ids.site}`;
  const crumbs = [{ label: company.name, href: `/setup/${ids.org}` }, { label: site.name }];
  const searchPlaceholder = tab === "points" ? "Search access points" : tab === "staff" ? "Search name or employee number" : "Search devices";

  return (
    <AppShell
      company={await companyBrand(ids.org)}
      eyebrow={<Breadcrumbs items={user.roles.includes("super_user") ? [{ label: "Security companies", href: "/setup" }, ...crumbs] : crumbs} />}
      title={site.name}
      chips={
        <div className="flex w-full flex-col gap-4">
          <p className="text-sm text-ink-muted">{summaryLine(site)}</p>
          <Tabs
            items={[
              { label: "Access points", href: base, active: tab === "points", count: pointCount },
              { label: "Gate staff", href: `${base}?tab=staff`, active: tab === "staff", count: staff.count ?? 0 },
              { label: "Devices", href: `${base}?tab=devices`, active: tab === "devices", count: devices.count ?? 0 },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox key={tab} placeholder={searchPlaceholder} />
            {tab === "points" ? (
              <FormDialog wide label="Add access point" title="Add an access point" icon="sites" submitLabel="Add access point" pendingLabel="Adding…" action={addAccessPoint} fields={{ orgId: ids.org, siteId: ids.site }}>
                <AccessPointFormFields near={near} />
              </FormDialog>
            ) : null}
            {tab === "staff" ? <AddGateStaffButton site={{ id: ids.site, orgId: ids.org, name: site.name, detail: company.name, siteType: site.site_type }} /> : null}
            {tab === "devices" ? (
              <PairDeviceButton place={{ company: { id: ids.org, name: company.name }, site: { id: ids.site, name: site.name } }} />
            ) : null}
          </div>
        </div>
      }
    >
      {justAdded ? (
        <AddedNotice
          title={`${site.name} is added, with ${pointCount} access point${pointCount === 1 ? "" : "s"}`}
          next="Now add its gate staff with Add gate staff, then pair a handheld under Devices."
        />
      ) : null}
      {tab === "points" ? <AccessPointList siteId={ids.site} query={query} path={base} near={near} /> : null}
      {tab === "staff" ? <StaffTab ids={ids} query={query} path={base} /> : null}
      {tab === "devices" ? <DevicesTab ids={ids} query={query} path={base} /> : null}
    </AppShell>
  );
}

export default function SitePage({ params, searchParams }: PageProps<"/setup/[org]/[site]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Site params={params} searchParams={searchParams} />
    </Suspense>
  );
}
