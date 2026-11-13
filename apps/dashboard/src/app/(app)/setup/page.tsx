import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { FilterBar } from "@/components/filter-bar";
import { AppShell } from "@/components/app-shell";
import { CompanyGrid } from "@/components/company-grid";
import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { companyCardOf } from "@/lib/company-brand";
import { likePattern, PAGE_SIZE, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { must } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";
import { licenceMigrationMissing } from "@/lib/site-licences";
import { supabaseServer } from "@/lib/supabase/server";

import { addOrganisation } from "./actions";

async function Companies({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  if (!isDigiGateStaff(user)) {
    if (user.roles.includes("admin") && user.orgId) redirect(`/setup/${user.orgId}`);
    redirect("/control-room");
  }

  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from] = rangeOf(page);

  // Counted in the database: gate staff can't be counted through the API without reaching their PIN hashes.
  const supabase = await supabaseServer();
  const companies = must(await supabase.rpc("company_board", { _search: search ? likePattern(search) : "", _limit: PAGE_SIZE, _offset: from }));
  const pendingRead = await supabase.from("site_licence_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  const awaitingLicences = licenceMigrationMissing(pendingRead.error);
  if (pendingRead.error && !awaitingLicences) throw new Error(`Licence requests couldn't be read (${pendingRead.error.code}).`);
  const count = companies[0]?.total ?? 0;

  return (
    <AppShell
      eyebrow="Everyone renting DigiGate"
      title="Security companies"
      chips={
        <>
          {user.roles.includes("super_user") ? <FormDialog label="Add company" title="Add a security company" icon="sites" submitLabel="Add company" pendingLabel="Adding…" action={addOrganisation}>
            <Field label="Company name" name="name" autoFocus required />
          </FormDialog> : null}
          <Link href="/setup/licence-requests" className="inline-flex h-11 items-center gap-2 rounded-pill bg-tile-sky px-5 text-sm font-semibold text-brand transition hover:bg-border">
            Site licence requests <span className="rounded-pill bg-surface px-2 py-0.5">{awaitingLicences ? "Awaiting activation" : pendingRead.count ?? 0}</span>
          </Link>
        </>
      }
    >
      <FilterBar label="Filter the companies">
        <SearchBox placeholder="Search companies" />
      </FilterBar>
      <CompanyGrid
        companies={companies.map(companyCardOf)}
        hrefFor={(id) => `/setup/${id}`}
        empty={search ? "Nothing matches that search." : "No security companies have been added yet."}
      />
      <div className="dg-glass mt-6 overflow-hidden empty:hidden">
        <Pagination page={page} total={count} hrefFor={(next) => pageHref("/setup", query, next)} />
      </div>
    </AppShell>
  );
}

export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Companies searchParams={searchParams} />
    </Suspense>
  );
}
