import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FilterBar } from "@/components/filter-bar";
import { AddedNotice } from "@/components/added-notice";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/skeleton";
import { Breadcrumbs, ListCard, ListRow, Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, must } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { canAdminister, isDigiGateStaff } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

import { CompanyChecklist } from "./company-checklist";
import { CompanyLook } from "./company-look";
import { SiteLicencePrompt } from "../site-licence-prompt";

const SITE_TYPES: Record<string, string> = { hospital: "Hospital", estate: "Residential estate" };

async function Company({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || !canAdminister(user)) {
    return <NoAccess message="Setting up gates needs an administrator. Your own dashboard is on the way." />;
  }

  const { org } = await params;
  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);

  const supabase = await supabaseServer();
  const company = await companyBrand(org);
  if (!company) notFound();
  const justAdded = textParam(query, "added") === "1";

  // Each place is a client with its one site; a client with none is a place added before the two were one, not set up yet.
  let list = supabase.from("clients").select("id, name, sites(id, code, site_type, posts(count))", { count: "exact" }).eq("org_id", org).order("name").range(from, to);
  if (search) list = list.ilike("name", likePattern(search));
  const listed = await list;
  const places = must(listed);
  const count = counted(listed);
  const path = `/setup/${org}`;

  return (
    <AppShell
      company={company}
      eyebrow={<Breadcrumbs items={isDigiGateStaff(user) ? [{ label: "Security companies", href: "/setup" }, { label: company.name }] : [{ label: company.name }]} />}
      title={company.name}
      chips={
        <>
          {user.roles.includes("super_user") ? <Link href={`${path}/new-site`} className="inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink">
            Add site
          </Link> : !isDigiGateStaff(user) ? <SiteLicencePrompt orgId={org} /> : null}
        </>
      }
    >
      {justAdded ? <AddedNotice title={`${company.name} is added`} next="Work down the checklist to get its first gate running." /> : null}
      <CompanyChecklist company={company} />
      <CompanyLook company={company} />
      <FilterBar label="Filter the sites">
        <SearchBox placeholder="Search sites" />
      </FilterBar>
      <ListCard
        isEmpty={places.length === 0}
        empty={search ? "Nothing matches that search." : "No sites have been created for this company yet."}
        footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
      >
        {places.map((place) => {
          const [site] = place.sites;
          if (!site) {
            return (
              <ListRow
                key={place.id}
                href={`${path}/new-site?place=${place.id}`}
                title={place.name}
                detail="Not set up yet. Open it to add its details and access points."
                trailing={<StatusChip status="warning" label="Not set up" />}
              />
            );
          }
          const points = site.posts[0]?.count ?? 0;
          return (
            <ListRow
              key={place.id}
              href={`${path}/${site.id}`}
              title={site.code ? `${place.name} · ${site.code}` : place.name}
              detail={`${SITE_TYPES[site.site_type] ?? site.site_type} · ${points} access point${points === 1 ? "" : "s"}`}
            />
          );
        })}
      </ListCard>
    </AppShell>
  );
}

export default function CompanyPage({ params, searchParams }: PageProps<"/setup/[org]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Company params={params} searchParams={searchParams} />
    </Suspense>
  );
}
