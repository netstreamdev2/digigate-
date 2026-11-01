import { countLabel } from "@digigate/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { ConfirmAction } from "@/components/dialog";
import { GlassPanel, GlassStat } from "@/components/glass";
import { Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SegmentedLinks } from "@/components/report-controls";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { plural, shortDate } from "@/lib/format";
import { appNav } from "@/lib/nav";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { gateStaffBoard, gateStaffCounts, loginBoard, loginCounts, type GateStaffMember, type Login, type PeopleFilter, type RoleCounts } from "@/lib/people";
import { must } from "@/lib/reads";
import { currentUser, roleLabel, roleName } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { setGateUserActive } from "../setup/actions";
import { setPersonActive } from "./actions";
import { AddPersonButton, ResetPasswordButton } from "./people-forms";

const MOST_COMPANIES = 500;
const NO_VALUE = "—";

const LOGIN_TABS = [
  { role: "super_user", label: "Super users" },
  { role: "admin", label: "Administrators" },
  { role: "manager", label: "Managers" },
  { role: "control_room", label: "Control room" },
  { role: "supervisor", label: "Supervisors" },
  { role: "client_viewer", label: "Client viewers" },
] as const;

const STAFF_TABS = [
  { role: "guard", label: "Guards" },
  { role: "supervisor", label: "Supervisors" },
] as const;

const ROLE_TINTS: Readonly<Record<string, string>> = {
  super_user: "bg-ink text-ink-inverse",
  admin: "bg-tile-lilac text-brand",
  manager: "bg-tile-sky text-brand",
  control_room: "bg-tile-mint text-brand",
  supervisor: "bg-tile-butter text-brand",
  client_viewer: "bg-surface-muted text-ink",
  guard: "bg-tile-mint text-brand",
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

function Clipped({ value }: { value: string }) {
  return (
    <span title={value} className="block max-w-56 truncate">
      {value}
    </span>
  );
}

/** Who someone is at a glance: their initials, their name and how to tell them apart. */
function PersonCell({ name, sub }: { name: string; sub: string }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className="dg-glass-soft grid size-9 shrink-0 place-items-center rounded-pill font-display text-xs font-semibold text-brand">
        {initialsOf(name)}
      </span>
      <span className="min-w-0">
        <span className="block max-w-56 truncate font-medium" title={name}>
          {name}
        </span>
        <span className="block max-w-56 truncate text-xs text-ink-muted" title={sub}>
          {sub}
        </span>
      </span>
    </span>
  );
}

function RoleChip({ role, label }: { role: string; label: string }) {
  return <span className={`inline-flex h-7 items-center rounded-pill px-2.5 text-xs font-semibold ${ROLE_TINTS[role] ?? "bg-surface-muted text-ink"}`}>{label}</span>;
}

function ActiveChip({ active }: { active: boolean }) {
  return active ? <StatusChip status="clear" label="Active" /> : <StatusChip status="blocked" label="Deactivated" />;
}

function accessOf(person: Login): string {
  if (person.role === "super_user") return "Everything";
  if (person.role === "admin") return "All sites";
  if (person.role === "client_viewer") return "Their client's sites";
  return plural(person.sites, "site");
}

function loginRow(person: Login, ownId: string) {
  const locked = person.id === ownId || person.role === "super_user";
  return {
    id: person.id,
    cells: {
      person: <PersonCell name={person.name} sub={person.login} />,
      role: <RoleChip role={person.role} label={roleName(person.role)} />,
      company: (
        <>
          <p className="font-medium">
            <Clipped value={person.client ?? person.company ?? "DigiGate"} />
          </p>
          <p className="text-xs text-ink-muted">{person.client ? <Clipped value={person.company ?? ""} /> : accessOf(person)}</p>
        </>
      ),
      added: <span className="text-ink-muted">{shortDate(person.addedAt)}</span>,
      status: <ActiveChip active={person.isActive} />,
      actions: locked ? null : (
        <span className="flex justify-end gap-2">
          <ConfirmAction
            label={person.isActive ? "Deactivate" : "Reactivate"}
            title={`${person.isActive ? "Deactivate" : "Reactivate"} ${person.name}?`}
            confirmLabel={person.isActive ? "Yes, deactivate" : "Yes, reactivate"}
            pendingLabel={person.isActive ? "Deactivating…" : "Reactivating…"}
            tone={person.isActive ? "danger" : "neutral"}
            icon={person.isActive ? "result-warning" : "users"}
            action={setPersonActive}
            fields={{ id: person.id, active: String(!person.isActive) }}
          >
            {person.isActive ? "They're signed out and can't get back in. Nothing is deleted, and you can reactivate them at any time." : "They'll be able to sign in again with the same role and sites."}
          </ConfirmAction>
          <ResetPasswordButton id={person.id} name={person.name} login={person.login} />
        </span>
      ),
    },
  };
}

function staffRow(person: GateStaffMember) {
  return {
    id: person.id,
    cells: {
      person: <PersonCell name={person.name} sub={`Employee ${person.employeeNumber}`} />,
      role: <RoleChip role={person.role} label={person.role === "guard" ? "Guard" : "Supervisor"} />,
      company: (
        <>
          <p className="font-medium">
            <Clipped value={person.company} />
          </p>
          <p className="text-xs text-ink-muted">{plural(person.sites, "site")}</p>
        </>
      ),
      duty: person.onDutyAt ? <StatusChip status="clear" label={person.onDutyAt} /> : <span className="text-ink-muted">{NO_VALUE}</span>,
      status: <ActiveChip active={person.isActive} />,
      actions: (
        <span className="flex justify-end">
          <ConfirmAction
            label={person.isActive ? "Deactivate" : "Reactivate"}
            title={`${person.isActive ? "Deactivate" : "Reactivate"} ${person.name}?`}
            confirmLabel={person.isActive ? "Yes, deactivate" : "Yes, reactivate"}
            pendingLabel={person.isActive ? "Deactivating…" : "Reactivating…"}
            tone={person.isActive ? "danger" : "neutral"}
            icon={person.isActive ? "result-warning" : "users"}
            action={setGateUserActive}
            fields={{ id: person.id, active: String(!person.isActive) }}
          >
            {person.isActive ? "They can't sign in on any handheld once it next syncs. Nothing is deleted, and you can reactivate them at any time." : "They'll be able to sign in on handhelds again after the next sync."}
          </ConfirmAction>
        </span>
      ),
    },
  };
}

async function loginTable(filter: PeopleFilter, page: number, ownId: string): Promise<{ total: number; table: ReactNode }> {
  const { people, total } = await loginBoard(filter, page);
  return {
    total,
    table: (
      <DataTable
        columns={[
          { key: "person", label: "Person" },
          { key: "role", label: "Role" },
          { key: "company", label: "Works for" },
          { key: "added", label: "Added" },
          { key: "status", label: "Status" },
          { key: "actions", label: "", align: "right" },
        ]}
        rows={people.map((person) => loginRow(person, ownId))}
      />
    ),
  };
}

async function staffTable(filter: PeopleFilter, page: number): Promise<{ total: number; table: ReactNode }> {
  const { people, total } = await gateStaffBoard(filter, page);
  return {
    total,
    table: (
      <DataTable
        columns={[
          { key: "person", label: "Person" },
          { key: "role", label: "Role" },
          { key: "company", label: "Works for" },
          { key: "duty", label: "On duty at" },
          { key: "status", label: "Status" },
          { key: "actions", label: "", align: "right" },
        ]}
        rows={people.map(staffRow)}
      />
    ),
  };
}

function RoleTabs({ tabs, counts, role, query }: { tabs: readonly { role: string; label: string }[]; counts: RoleCounts; role: string; query: Query }) {
  return (
    <Tabs
      items={[
        { label: "Everyone", href: pageHref("/people", { ...query, role: undefined }, 1), active: role === "", count: counts.total },
        ...tabs
          .filter((tab) => (counts.byRole[tab.role] ?? 0) > 0 || tab.role === role)
          .map((tab) => ({ label: tab.label, href: pageHref("/people", { ...query, role: tab.role }, 1), active: tab.role === role, count: counts.byRole[tab.role] ?? 0 })),
      ]}
    />
  );
}

function NothingHere({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-sm text-ink-muted">{filtered ? "Nobody matches that." : "Nobody here yet."}</p>
      {filtered ? (
        <Link href="/people" className="text-sm font-semibold text-brand hover:text-ink">
          Clear the search and filters
        </Link>
      ) : null}
    </div>
  );
}

async function People({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const isSuperUser = user.roles.includes("super_user");
  if (!isSuperUser && !user.roles.includes("admin")) redirect("/control-room");

  const query = await searchParams;
  const onGateStaff = textParam(query, "view") === "gate";
  const search = textParam(query, "q");
  const page = pageParam(query);
  const status = ["active", "inactive"].find((value) => value === textParam(query, "status")) ?? "";
  const newest = textParam(query, "sort") === "newest";
  const tabs: readonly { role: string; label: string }[] = onGateStaff ? STAFF_TABS : LOGIN_TABS;
  const role = tabs.find((tab) => tab.role === textParam(query, "role"))?.role ?? "";

  const supabase = await supabaseServer();
  const companies = must(await supabase.from("organisations").select("id, name").order("name").limit(MOST_COMPANIES));
  const company = companies.find((row) => row.id === textParam(query, "company"))?.id ?? "";

  const filter = { search, role, status, newest, company };
  const [logins, staff, shown] = await Promise.all([
    loginCounts(search, company),
    gateStaffCounts(search, company),
    onGateStaff ? staffTable(filter, page) : loginTable(filter, page, user.id),
  ]);
  const filtered = Boolean(search || role || status || company);

  return (
    <AppShell
      nav={appNav(user, "people")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow="Everyone with access, from dashboard logins to the guards at the gate"
      title="People"
      plain
      glass
      actions={onGateStaff ? null : companies.length ? <AddPersonButton companies={companies} /> : null}
      chips={
        <>
          <SegmentedLinks
            label="Who to show"
            items={[
              { label: `Dashboard logins · ${countLabel(logins.total)}`, href: pageHref("/people", { ...query, view: undefined, role: undefined }, 1), active: !onGateStaff },
              { label: `Gate staff · ${countLabel(staff.total)}`, href: pageHref("/people", { ...query, view: "gate", role: undefined }, 1), active: onGateStaff },
            ]}
          />
          <SearchBox placeholder={onGateStaff ? "Name, number or company" : "Name, username or company"} />
          {isSuperUser ? <FilterSelect name="company" label="All companies" options={companies.map((row) => ({ value: row.id, label: row.name }))} /> : null}
          <FilterSelect
            name="status"
            label="Any status"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Deactivated" },
            ]}
          />
          <FilterSelect name="sort" label="Name, A to Z" options={[{ value: "newest", label: "Newest first" }]} />
        </>
      }
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassStat label="Dashboard logins" value={countLabel(logins.total)} icon="users" note={`${countLabel(logins.active)} active`} />
        <GlassStat label="Gate staff" value={countLabel(staff.total)} icon="guard" note={`${countLabel(staff.byRole.supervisor ?? 0)} supervisors`} />
        <GlassStat label="On duty now" value={countLabel(staff.onDuty)} icon="on-site" note="On a shift at a gate" />
        <GlassStat label="Deactivated" value={countLabel(logins.deactivated + staff.deactivated)} icon="lock" note="Logins and gate staff" />
      </section>

      <div className="mt-6">
        <RoleTabs tabs={tabs} counts={onGateStaff ? staff : logins} role={role} query={query} />
      </div>

      <GlassPanel
        className="mt-6"
        title={onGateStaff ? "Gate staff" : "Dashboard logins"}
        subtitle={onGateStaff ? "They sign in at the gate with an employee number and PIN. Add them under their site, in Companies." : "They sign in to this dashboard with a password and an authenticator code."}
      >
        {shown.total === 0 ? <NothingHere filtered={filtered} /> : shown.table}
        <div className="-mx-6 -mb-6 mt-4">
          <Pagination page={page} total={shown.total} hrefFor={(next) => pageHref("/people", query, next)} />
        </div>
      </GlassPanel>
    </AppShell>
  );
}

export default function PeoplePage({ searchParams }: PageProps<"/people">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <People searchParams={searchParams} />
    </Suspense>
  );
}
