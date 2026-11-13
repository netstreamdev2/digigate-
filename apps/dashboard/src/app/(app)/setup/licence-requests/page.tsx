import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { FilterBar } from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import { Breadcrumbs, Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { isDigiGateStaff } from "@/lib/access";
import { shortDate, timeOfDay } from "@/lib/format";
import { likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, must } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { licenceMigrationMissing } from "@/lib/site-licences";
import { SiteLicencePrompt } from "../site-licence-prompt";
import { AddPersonButton } from "../../people/people-forms";

import { declineSiteLicence } from "../licence-actions";

const PATH = "/setup/licence-requests";
const STATUSES = [{ value: "pending", label: "Waiting for DigiGate" }, { value: "fulfilled", label: "Sites created" }, { value: "declined", label: "Closed" }];

async function Requests({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || !isDigiGateStaff(user)) return <NoAccess message="DigiGate staff look after site licence requests. Your company's administrator can request a licence from Companies." />;
  const query = await searchParams;
  const status = STATUSES.find((item) => item.value === textParam(query, "status"))?.value ?? "pending";
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);
  const supabase = await supabaseServer();
  let read = supabase.from("site_licence_requests").select("id, org_id, site_name, site_type, note, requested_at, status, site_id, organisations(name), profiles!site_licence_requests_requested_by_fkey(full_name)", { count: "exact" }).eq("status", status).order("requested_at", { ascending: false }).order("id").range(from, to);
  if (search) read = read.ilike("site_name", likePattern(search));
  const result = await read;
  if (licenceMigrationMissing(result.error)) {
    return (
      <AppShell eyebrow="Site licences" title="Site licence requests">
        <section className="dg-glass mt-6 max-w-2xl p-6">
          <h2 className="font-display text-xl font-semibold">Site licences are awaiting activation</h2>
          <p className="mt-2 text-sm text-ink-muted">The database update for this feature has not been applied yet. Existing sites continue to work.</p>
          {process.env.NODE_ENV === "development" ? <>
            <p className="mt-4 text-sm text-ink-muted">Local design preview: open the forms below to inspect them. Submitting is disabled in this preview.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <SiteLicencePrompt orgId="" preview />
              <AddPersonButton companies={[]} role="technician" label="Preview technician form" preview />
            </div>
          </> : null}
        </section>
      </AppShell>
    );
  }
  const requests = must(result);
  const total = counted(result);
  return (
    <AppShell eyebrow={<Breadcrumbs items={[{ label: "Security companies", href: "/setup" }, { label: "Site licences" }]} />} title="Site licence requests">
      <p className="mt-3 max-w-2xl text-sm text-ink-muted">Companies ask here when they take on a new site. Arrange the licence, then create the site for them. Only super users can create sites or close requests.</p>
      <div className="mt-6"><Tabs items={STATUSES.map((item) => ({ label: item.label, href: pageHref(PATH, { ...query, status: item.value }, 1), active: item.value === status }))} /></div>
      <FilterBar label="Filter licence requests"><SearchBox placeholder="Search site names" /></FilterBar>
      <section aria-label="Licence requests" className="dg-glass mt-6 overflow-hidden">
        {requests.length ? <ul className="divide-y divide-border">{requests.map((request) => (
          <li key={request.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="min-w-0 flex-1">
              <h2 className="break-words font-display text-lg font-semibold">{request.site_name}</h2>
              <p className="mt-1 text-sm text-ink-muted"><Link href={`/setup/${request.org_id}`} className="font-medium text-brand hover:underline">{request.organisations?.name ?? "Company"}</Link>{` · ${request.site_type === "estate" ? "Residential estate" : "Hospital"}`}</p>
              <p className="mt-1 text-xs text-ink-muted">{`Requested by ${request.profiles?.full_name ?? "administrator"} · ${shortDate(request.requested_at)}, ${timeOfDay(request.requested_at)}`}</p>
              {request.note ? <p className="mt-3 whitespace-pre-wrap break-words text-sm">{request.note}</p> : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {status === "pending" && user.roles.includes("super_user") ? <>
                <Link href={`/setup/${request.org_id}/new-site?request=${request.id}`} className="inline-flex h-11 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink">Create site</Link>
                <FormDialog compact label="Close request" title={`Close the request for ${request.site_name}?`} icon="sites" submitLabel="Close request" pendingLabel="Closing…" action={declineSiteLicence} fields={{ requestId: request.id }}><p className="text-sm text-ink-muted">This closes the licence request without creating a site. The company can request again later.</p></FormDialog>
              </> : null}
              {request.site_id ? <Link href={`/setup/${request.org_id}/${request.site_id}`} className="text-sm font-semibold text-brand hover:underline">Open site</Link> : null}
            </div>
          </li>
        ))}</ul> : <p className="p-8 text-center text-sm text-ink-muted">{search ? "No site names match that search." : status === "pending" ? "No licence requests waiting. New requests from company administrators will appear here." : "No requests here yet."}</p>}
        <Pagination page={page} total={total} hrefFor={(next) => pageHref(PATH, query, next)} />
      </section>
    </AppShell>
  );
}

export default function LicenceRequestsPage({ searchParams }: PageProps<"/setup/licence-requests">) {
  return <Suspense fallback={<PageSkeleton />}><Requests searchParams={searchParams} /></Suspense>;
}
