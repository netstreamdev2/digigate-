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
import { canAdminister, isDigiGateStaff } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

import { SiteWizard } from "../../site-wizard";
import { LicenceRequestForm } from "../../site-licence-prompt";

async function NewSite({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || !canAdminister(user)) {
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
  const requestId = textParam(query, "request");
  if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId)) notFound();
  const licence = requestId ? maybe(await supabase.from("site_licence_requests").select("id, site_name, site_type, note").eq("id", requestId).eq("org_id", org).eq("status", "pending").maybeSingle()) : null;
  if (requestId && !licence) notFound();
  if (isDigiGateStaff(user) && !user.roles.includes("super_user")) return <NoAccess message="DigiGate super users create sites once their licences are arranged. You can view licence requests under Site licences." />;

  const companyHref = `/setup/${org}`;
  const crumbs = [{ label: company.name, href: companyHref }, { label: unfinished ? unfinished.name : "New site" }];

  return (
    <AppShell
      company={await companyBrand(org)}
      eyebrow={<Breadcrumbs items={isDigiGateStaff(user) ? [{ label: "Security companies", href: "/setup" }, ...crumbs] : crumbs} />}
      title={user.roles.includes("super_user") ? unfinished ? `Set up ${unfinished.name}` : `Add a site to ${company.name}` : "Request a site licence"}
    >
      {user.roles.includes("super_user") ? <>
        {licence ? <p className="dg-glass mt-6 p-5 text-sm text-ink-muted">{`Fulfilling the licence request for ${licence.site_name}.${licence.note ? ` ${licence.note}` : ""}`}</p> : null}
        <SiteWizard orgId={org} placeId={unfinished?.id ?? null} initialName={licence?.site_name ?? unfinished?.name ?? ""} initialType={licence?.site_type === "estate" ? "estate" : "hospital"} licenceRequestId={licence?.id} cancelHref={licence ? "/setup/licence-requests" : companyHref} />
      </> : <section className="dg-glass mt-6 max-w-xl p-6"><LicenceRequestForm orgId={org} initialName={unfinished?.name} /></section>}
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
