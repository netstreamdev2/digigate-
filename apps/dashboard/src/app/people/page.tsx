import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/dialog";
import { ListCard, Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { adminNav } from "@/lib/nav";
import { anyColumnLike, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { currentUser, roleLabel, roleName } from "@/lib/session";
import type { Database } from "@/lib/supabase/database";
import { supabaseServer } from "@/lib/supabase/server";

import { setPersonActive } from "./actions";
import { AddPersonButton, ResetPasswordButton } from "./people-forms";

type Role = Database["digigate"]["Enums"]["dashboard_role"];

const FILTER_ROLES: readonly Role[] = ["admin", "manager", "control_room", "supervisor", "client_viewer"];

const MOST_COMPANIES = 500;

const asRole = (value: string): Role | null => FILTER_ROLES.find((role) => role === value) ?? null;

async function People({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  const isSuperUser = user?.roles.includes("super_user") ?? false;
  if (!user || (!isSuperUser && !user.roles.includes("admin"))) return <NoAccess message="Managing people needs an administrator." />;

  const query = await searchParams;
  const search = textParam(query, "q");
  const role = asRole(textParam(query, "role"));
  const company = textParam(query, "company");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);

  const supabase = await supabaseServer();
  const { data: companies } = await supabase.from("organisations").select("id, name").order("name").limit(MOST_COMPANIES);

  let list = supabase
    .from("profiles")
    .select("id, full_name, login, roles, org_id, client_id, is_active", { count: "exact" })
    .order("full_name")
    .range(from, to);
  if (search) list = list.or(anyColumnLike(["full_name", "login"], search));
  if (role) list = list.contains("roles", [role]);
  if (company) list = list.eq("org_id", company);
  const { data: people, count } = await list;

  // Client names only for the rows on this page.
  const clientIds = (people ?? []).flatMap((person) => (person.client_id ? [person.client_id] : []));
  const { data: clients } = clientIds.length ? await supabase.from("clients").select("id, name").in("id", clientIds) : { data: [] };

  const nameOf = (rows: readonly { id: string; name: string }[] | null, id: string | null) => rows?.find((row) => row.id === id)?.name ?? "";
  const worksFor = (person: { org_id: string | null; client_id: string | null }) => nameOf(companies, person.org_id) || nameOf(clients, person.client_id) || "DigiGate";

  return (
    <AppShell
      nav={adminNav("people")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow="Dashboard logins. Guards are added under each site."
      title="People"
      plain
      chips={
        <>
          <SearchBox placeholder="Search name or username" />
          <FilterSelect name="role" label="All roles" options={FILTER_ROLES.map((value) => ({ value, label: roleName(value) }))} />
          {isSuperUser ? <FilterSelect name="company" label="All companies" options={(companies ?? []).map((row) => ({ value: row.id, label: row.name }))} /> : null}
          {companies?.length ? <AddPersonButton companies={companies} /> : null}
        </>
      }
    >
      <ListCard
        isEmpty={!people?.length}
        empty={search || role || company ? "Nobody matches that." : "Nobody here yet."}
        footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref("/people", query, next)} />}
      >
        {people?.map((person) => {
          const isLocked = person.id === user.id || person.roles.includes("super_user");
          return (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{person.full_name}</span>
                <span className="block truncate text-sm text-ink-muted">{`${person.login} · ${roleName(person.roles[0] ?? "")} · ${worksFor(person)}`}</span>
              </span>
              {isLocked ? null : (
                <span className="flex flex-wrap items-center gap-2">
                  {person.is_active ? null : <StatusChip status="blocked" label="Deactivated" />}
                  {person.is_active ? (
                    <ConfirmAction
                      label="Deactivate"
                      title={`Deactivate ${person.full_name}?`}
                      confirmLabel="Yes, deactivate"
                      pendingLabel="Deactivating…"
                      tone="danger"
                      icon="result-warning"
                      action={setPersonActive}
                      fields={{ id: person.id, active: "false" }}
                    >
                      They&apos;re signed out and can&apos;t get back in. Nothing is deleted, and you can reactivate them at any time.
                    </ConfirmAction>
                  ) : (
                    <ConfirmAction
                      label="Reactivate"
                      title={`Reactivate ${person.full_name}?`}
                      confirmLabel="Yes, reactivate"
                      pendingLabel="Reactivating…"
                      tone="neutral"
                      icon="users"
                      action={setPersonActive}
                      fields={{ id: person.id, active: "true" }}
                    >
                      They&apos;ll be able to sign in again with the same role and sites.
                    </ConfirmAction>
                  )}
                  <ResetPasswordButton id={person.id} name={person.full_name} login={person.login} />
                </span>
              )}
            </li>
          );
        })}
      </ListCard>
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
