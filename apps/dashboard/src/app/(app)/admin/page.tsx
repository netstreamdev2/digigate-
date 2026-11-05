import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FilterBar } from "@/components/filter-bar";
import { AppShell } from "@/components/app-shell";
import { CompanyGrid } from "@/components/company-grid";
import { Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { companyCardOf } from "@/lib/company-brand";
import { likePattern, PAGE_SIZE, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { must } from "@/lib/reads";
import { currentUser } from "@/lib/session";
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
      eyebrow="Guard records, access points and shift times"
      title="Admin"
    >
      <FilterBar label="Filter the companies">
        <SearchBox placeholder="Search companies" />
      </FilterBar>
      <CompanyGrid companies={companies.map(companyCardOf)} hrefFor={(id) => `/admin/${id}`} empty={search ? "Nothing matches that search." : "No security companies yet."} />
      <div className="dg-glass mt-6 overflow-hidden empty:hidden">
        <Pagination page={page} total={count} hrefFor={(next) => pageHref("/admin", query, next)} />
      </div>
    </AppShell>
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Admin searchParams={searchParams} />
    </Suspense>
  );
}
