import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/skeleton";
import { Breadcrumbs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { companyBrand } from "@/lib/company-brand";
import { textParam, type Query } from "@/lib/paging";
import { maybe } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { SiteWizard } from "../../site-wizard";

async function NewSite({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || (!user.roles.includes("super_user") && !user.roles.includes("admin"))) {
    return <NoAccess message="Setting up gates needs an administrator. Your own dashboard is on the way." />;
  }

  const { org } = await params;
  const query = await searchParams;
  const placeId = textParam(query, "place");
  const supabase = await supabaseServer();
  const [companyRead, placeRead] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", org).maybeSingle(),
    // A place added before sites and clients were one: it has a name and its records, but no site yet.
    placeId ? supabase.from("clients").select("id, name, sites(count)").eq("id", placeId).eq("org_id", org).maybeSingle() : null,
  ]);
  const company = maybe(companyRead);
  if (!company) notFound();
  const place = placeRead ? maybe(placeRead) : null;
  const unfinished = place && (place.sites[0]?.count ?? 0) === 0 ? place : null;

  const companyHref = `/setup/${org}`;
  const crumbs = [{ label: company.name, href: companyHref }, { label: unfinished ? unfinished.name : "New site" }];

  return (
    <AppShell
      company={await companyBrand(org)}
      eyebrow={<Breadcrumbs items={user.roles.includes("super_user") ? [{ label: "Security companies", href: "/setup" }, ...crumbs] : crumbs} />}
      title={unfinished ? `Set up ${unfinished.name}` : `Add a site to ${company.name}`}
    >
      <SiteWizard orgId={org} placeId={unfinished?.id ?? null} initialName={unfinished?.name ?? ""} cancelHref={companyHref} />
    </AppShell>
  );
}

export default function NewSitePage({ params, searchParams }: PageProps<"/setup/[org]/new-site">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewSite params={params} searchParams={searchParams} />
    </Suspense>
  );
}
