import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ListCard, ListRow, Pagination } from "@/components/list";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { siteBoard } from "@/lib/control-room";
import { plural, timeWithSeconds } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";

async function Board({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;

  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  // A super user working inside a company sees that company's sites; everyone else sees theirs anyway.
  const company = user.roles.includes("super_user") ? textParam(query, "company") : "";
  const [{ sites, total }, brand] = await Promise.all([siteBoard(search, page, company), company ? companyBrand(company) : null]);
  const siteHref = (id: string) => (company ? `/control-room/${id}?company=${company}` : `/control-room/${id}`);

  const only = sites[0];
  if (only && total === 1 && !search) redirect(siteHref(only.id));

  const now = readClock();
  return (
    <AppShell
      company={brand}
      eyebrow="Every site you look after, trouble first"
      title="Control room"
      chips={
        <>
          <SearchBox placeholder="Search a site" />
          <LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />
        </>
      }
    >
      <ListCard
        isEmpty={sites.length === 0}
        empty={search ? "Nothing matches that search." : "You don't look after any sites yet."}
        footer={<Pagination page={page} total={total} hrefFor={(next) => pageHref("/control-room", query, next)} />}
      >
        {sites.map((site) => (
          <ListRow
            key={site.id}
            href={siteHref(site.id)}
            title={site.name}
            detail={`${plural(site.onSite, "person", "people")} on site · ${plural(site.onDuty, "guard")} on duty`}
            trailing={
              <>
                {site.red > 0 ? <StatusChip status="blocked" label={`${site.red} blocked`} /> : null}
                {site.amber > 0 ? <StatusChip status="warning" label={plural(site.amber, "warning")} /> : null}
              </>
            }
          />
        ))}
      </ListCard>
    </AppShell>
  );
}

export default function ControlRoomPage({ searchParams }: PageProps<"/control-room">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
