import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ListCard, ListRow, Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { plural } from "@/lib/format";
import { appNav } from "@/lib/nav";
import { likePattern, PAGE_SIZE, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { must } from "@/lib/reads";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

/** Admin opens straight onto a company's own records; only a super user, who looks after every company, picks one first. */
async function Admin({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  if (!user.roles.includes("super_user")) {
    if (user.roles.includes("admin") && user.orgId) redirect(`/admin/${user.orgId}`);
    return <NoAccess message="Admin is for your company's administrators." />;
  }

  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from] = rangeOf(page);
  const supabase = await supabaseServer();
  const companies = must(await supabase.rpc("company_board", { _search: search ? likePattern(search) : "", _limit: PAGE_SIZE, _offset: from }));
  const count = companies[0]?.total ?? 0;

  return (
    <AppShell
      nav={appNav(user, "admin")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow="Guard records, access points and shift times"
      title="Admin"
      plain
      chips={<SearchBox placeholder="Search companies" />}
    >
      <ListCard
        isEmpty={companies.length === 0}
        empty={search ? "Nothing matches that search." : "No security companies yet."}
        footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref("/admin", query, next)} />}
      >
        {companies.map((company) => (
          <ListRow
            key={company.id}
            href={`/admin/${company.id}`}
            title={company.name}
            detail={`${company.gate_staff} gate staff · ${plural(company.sites, "site")}`}
            trailing={company.is_active ? null : <StatusChip status="blocked" label="Inactive" />}
          />
        ))}
      </ListCard>
    </AppShell>
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Admin searchParams={searchParams} />
    </Suspense>
  );
}
