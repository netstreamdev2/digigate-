import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ListCard, ListRow, Pagination } from "@/components/list";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { siteBoard } from "@/lib/control-room";
import { plural, timeWithSeconds } from "@/lib/format";
import { appNav } from "@/lib/nav";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { currentUser, roleLabel } from "@/lib/session";

async function Board({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;

  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const { sites, total } = await siteBoard(search, page);

  const only = sites[0];
  if (only && total === 1 && !search) redirect(`/control-room/${only.id}`);

  const now = readClock();
  return (
    <AppShell
      nav={appNav(user, "control-room")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow="Every site you look after, trouble first"
      title="Control room"
      plain
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
            href={`/control-room/${site.id}`}
            title={site.name}
            detail={`${site.onSite} on site · ${plural(site.onDuty, "guard")} on duty`}
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
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
