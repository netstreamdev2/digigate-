import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { ListCard, ListRow, Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { adminNav } from "@/lib/nav";
import { likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { addOrganisation } from "./actions";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

async function Companies({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  if (!user.roles.includes("super_user")) {
    if (user.roles.includes("admin") && user.orgId) redirect(`/setup/${user.orgId}`);
    return <NoAccess message="Setting up gates needs an administrator. Your own dashboard is on the way." />;
  }

  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);

  const supabase = await supabaseServer();
  let list = supabase
    .from("organisations")
    .select("id, name, is_active, clients(count), sites(count), gate_users(count)", { count: "exact" })
    .order("name")
    .range(from, to);
  if (search) list = list.ilike("name", likePattern(search));
  const { data: companies, count } = await list;

  return (
    <AppShell
      nav={adminNav("setup")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow="Everyone renting DigiGate"
      title="Security companies"
      plain
      chips={
        <>
          <SearchBox placeholder="Search companies" />
          <FormDialog label="Add company" title="Add a security company" icon="sites" submitLabel="Add company" pendingLabel="Adding…" action={addOrganisation}>
            <Field label="Company name" name="name" autoFocus required />
          </FormDialog>
        </>
      }
    >
      <ListCard
        isEmpty={!companies?.length}
        empty={search ? "Nothing matches that search." : "No security companies yet. Add the first one."}
        footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref("/setup", query, next)} />}
      >
        {companies?.map((company) => (
          <ListRow
            key={company.id}
            href={`/setup/${company.id}`}
            title={company.name}
            detail={`${plural(company.clients[0]?.count ?? 0, "client")} · ${plural(company.sites[0]?.count ?? 0, "site")} · ${company.gate_users[0]?.count ?? 0} gate staff`}
            trailing={company.is_active ? null : <StatusChip status="blocked" label="Inactive" />}
          />
        ))}
      </ListCard>
    </AppShell>
  );
}

export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Companies searchParams={searchParams} />
    </Suspense>
  );
}
