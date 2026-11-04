import { missingFromRecord, readShiftPeriods } from "@digigate/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Breadcrumbs, ListCard, ListRow, Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { plural } from "@/lib/format";
import { appNav } from "@/lib/nav";
import { anyColumnLike, likePattern, PAGE_SIZE, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, maybe, must } from "@/lib/reads";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { AddGateStaffButton } from "../../setup/gate-staff-form";

type Tab = "guards" | "sites";
const asTab = (value: string): Tab => (value === "sites" ? "sites" : "guards");

const STATUSES = { "": "All", incomplete: "Still to fill in", complete: "Complete" } as const;
type Status = keyof typeof STATUSES;
const asStatus = (value: string): Status => (value === "incomplete" || value === "complete" ? value : "");

const FILTER = "inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold transition";

async function GuardsTab({ org, query, path }: { org: string; query: Query; path: string }) {
  const search = textParam(query, "q");
  const status = asStatus(textParam(query, "status"));
  const page = pageParam(query);
  const [from] = rangeOf(page);
  const supabase = await supabaseServer();
  const guards = must(await supabase.rpc("guard_board", { _org: org, _search: search ? likePattern(search) : "", _status: status, _limit: PAGE_SIZE, _offset: from }));
  const total = guards[0]?.total ?? 0;
  return (
    <>
      <nav aria-label="Show" className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(STATUSES) as Status[]).map((option) => (
          <Link
            key={option || "all"}
            href={pageHref(path, { ...query, status: option || undefined }, 1)}
            aria-current={status === option ? "page" : undefined}
            className={`${FILTER} ${status === option ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
          >
            {STATUSES[option]}
          </Link>
        ))}
      </nav>
      <ListCard
        isEmpty={guards.length === 0}
        empty={search || status ? "No guard matches that." : "No gate staff yet. Add them with Add gate staff, then fill in their records here."}
        footer={<Pagination page={page} total={total} hrefFor={(next) => pageHref(path, query, next)} />}
      >
        {guards.map((guard) => {
          const missing = missingFromRecord({
            photo: guard.has_photo,
            idNumber: guard.has_id,
            psira: guard.has_psira,
            nextOfKin: guard.has_next_of_kin,
            address: guard.has_address,
          });
          const chip = !guard.is_active ? (
            <StatusChip status="blocked" label="Deactivated" />
          ) : missing.length === 0 ? (
            <StatusChip status="clear" label="Record complete" />
          ) : (
            <StatusChip status="warning" label={`Missing ${missing.join(", ")}`} />
          );
          return (
            <ListRow
              key={guard.id}
              href={`${path}/guards/${guard.id}`}
              title={`${guard.first_name} ${guard.last_name}`}
              detail={[guard.employee_number, guard.role === "supervisor" ? "Supervisor" : "Guard", guard.psira_grade ? `PSIRA grade ${guard.psira_grade}` : null, guard.sites ?? "No site yet"].filter(Boolean).join(" · ")}
              trailing={chip}
            />
          );
        })}
      </ListCard>
    </>
  );
}

async function SitesTab({ org, query, path }: { org: string; query: Query; path: string }) {
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);
  const supabase = await supabaseServer();
  let list = supabase.from("sites").select("id, name, code, shift_periods, posts(count)", { count: "exact" }).eq("org_id", org).order("name").range(from, to);
  if (search) list = list.or(anyColumnLike(["name", "code"], search));
  const listed = await list;
  const sites = must(listed);
  return (
    <ListCard
      isEmpty={sites.length === 0}
      empty={search ? "Nothing matches that search." : "No sites yet. Add them under Companies."}
      footer={<Pagination page={page} total={counted(listed) ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
    >
      {sites.map((site) => {
        const points = site.posts[0]?.count ?? 0;
        const shifts = readShiftPeriods(site.shift_periods).map((period) => `${period.label} ${period.start} to ${period.end}`);
        return (
          <ListRow
            key={site.id}
            href={`${path}/sites/${site.id}`}
            title={site.code ? `${site.name} · ${site.code}` : site.name}
            detail={`${plural(points, "access point")} · ${shifts.join(", ")}`}
          />
        );
      })}
    </ListCard>
  );
}

async function Company({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  const { org } = await params;
  const isSuper = user?.roles.includes("super_user") ?? false;
  if (!user || (!isSuper && !(user.roles.includes("admin") && user.orgId === org))) {
    return <NoAccess message="Admin is for your company's administrators." />;
  }

  const query = await searchParams;
  const tab = asTab(textParam(query, "tab"));
  const supabase = await supabaseServer();
  const company = maybe(await supabase.from("organisations").select("name").eq("id", org).maybeSingle());
  if (!company) notFound();

  const path = `/admin/${org}`;
  const crumbs = isSuper ? [{ label: "Admin", href: "/admin" }, { label: company.name }] : [{ label: "Admin" }];

  return (
    <AppShell
      nav={appNav(user, "admin")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow={<Breadcrumbs items={crumbs} />}
      title={company.name}
      plain
      chips={
        <div className="flex w-full flex-col gap-4">
          <Tabs
            items={[
              { label: "Guards", href: path, active: tab === "guards" },
              { label: "Sites, access points and shifts", href: `${path}?tab=sites`, active: tab === "sites" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox key={tab} placeholder={tab === "guards" ? "Search name or employee number" : "Search a site name or code"} />
            {tab === "guards" ? <AddGateStaffButton /> : null}
          </div>
        </div>
      }
    >
      <div className="mt-6">
        {tab === "guards" ? <GuardsTab org={org} query={query} path={path} /> : <SitesTab org={org} query={query} path={path} />}
      </div>
    </AppShell>
  );
}

export default function AdminCompanyPage({ params, searchParams }: PageProps<"/admin/[org]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Company params={params} searchParams={searchParams} />
    </Suspense>
  );
}
