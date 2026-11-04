import { readShiftPeriods, shiftLengthMinutes } from "@digigate/core";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/skeleton";
import { FormDialog } from "@/components/form-dialog";
import { Breadcrumbs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { companyBrand } from "@/lib/company-brand";
import { textParam, type Query } from "@/lib/paging";
import { maybe } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { AccessPointFormFields } from "../../../../setup/access-point-editor";
import { AccessPointList } from "../../../../setup/access-point-list";
import { addAccessPoint } from "../../../../setup/actions";
import { saveShiftPeriods } from "../../../actions";
import { ShiftPeriodsFields } from "../../../shift-periods-fields";

const hoursOf = (minutes: number | null) => (minutes === null ? "" : `${Math.round((minutes / 60) * 10) / 10} h`);

async function SiteAdmin({ params, searchParams }: { params: Promise<{ org: string; site: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  const { org, site: siteId } = await params;
  const isSuper = user?.roles.includes("super_user") ?? false;
  if (!user || (!isSuper && !(user.roles.includes("admin") && user.orgId === org))) {
    return <NoAccess message="Admin is for your company's administrators." />;
  }

  const query = await searchParams;
  const supabase = await supabaseServer();
  const [companyRead, siteRead] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", org).maybeSingle(),
    supabase.from("sites").select("id, name, code, shift_periods, latitude, longitude").eq("id", siteId).eq("org_id", org).maybeSingle(),
  ]);
  const company = maybe(companyRead);
  const site = maybe(siteRead);
  if (!company || !site) notFound();
  const periods = readShiftPeriods(site.shift_periods);
  const near = site.latitude !== null && site.longitude !== null ? { latitude: site.latitude, longitude: site.longitude } : null;

  const path = `/admin/${org}/sites/${siteId}`;
  const crumbs = [
    ...(isSuper ? [{ label: "Admin", href: "/admin" }] : []),
    { label: company.name, href: `/admin/${org}?tab=sites` },
    { label: site.name },
  ];

  return (
    <AppShell
      company={await companyBrand(org)}
      eyebrow={<Breadcrumbs items={crumbs} />}
      title={site.code ? `${site.name} · ${site.code}` : site.name}
    >
      <section className="mt-6 dg-glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Shift times</h2>
            <p className="mt-0.5 text-sm text-ink-muted">What guards pick from when they start a shift here. Handhelds pick up a change on their next sync.</p>
          </div>
          <FormDialog wide compact label="Change shift times" title={`Shift times at ${site.name}`} icon="duration" submitLabel="Save shift times" pendingLabel="Saving…" action={saveShiftPeriods} fields={{ siteId }}>
            <ShiftPeriodsFields defaults={periods} />
          </FormDialog>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {periods.map((period) => (
            <li key={period.code} className="rounded-md bg-surface-muted px-4 py-3">
              <p className="text-sm font-semibold">{period.label}</p>
              <p className="font-display text-xl font-semibold tabular-nums tracking-tight">{`${period.start} to ${period.end}`}</p>
              <p className="text-xs text-ink-muted">{hoursOf(shiftLengthMinutes(period))}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Access points</h2>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox key={textParam(query, "q") ? "searching" : "idle"} placeholder="Search access points" />
            <FormDialog wide label="Add access point" title="Add an access point" icon="sites" submitLabel="Add access point" pendingLabel="Adding…" action={addAccessPoint} fields={{ orgId: org, siteId }}>
              <AccessPointFormFields near={near} />
            </FormDialog>
          </div>
        </div>
        <AccessPointList siteId={siteId} query={query} path={path} near={near} />
      </section>
    </AppShell>
  );
}

export default function AdminSitePage({ params, searchParams }: PageProps<"/admin/[org]/sites/[site]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SiteAdmin params={params} searchParams={searchParams} />
    </Suspense>
  );
}
