import { Suspense } from "react";

import { ActivityTable, type ActivityRow } from "@/components/activity-table";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { DataTable, TwoLine } from "@/components/data-table";
import { Breadcrumbs, Pagination, Tabs } from "@/components/list";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import {
  entriesToday,
  gatesAt,
  insideCounts,
  insideNow,
  latestChecks,
  openAlerts,
  siteHeading,
  type Check,
  type Gate,
  type Lane,
} from "@/lib/control-room";
import { duration, labelFor, plural, timeOfDay, timeWithSeconds } from "@/lib/format";
import { appNav } from "@/lib/nav";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { currentUser, roleLabel } from "@/lib/session";

import { LiveAlerts } from "../live-alerts";

/** Handhelds sync every minute, so three missed rounds means this one has gone quiet. */
const DEVICE_QUIET_MS = 3 * 60_000;

const NO_VALUE = "—";

function gateRow(gate: Gate, now: number) {
  const onDuty = gate.onDutySince !== null;
  const quiet = gate.deviceSeenAt === null || now - new Date(gate.deviceSeenAt).getTime() > DEVICE_QUIET_MS;
  return {
    id: gate.post,
    cells: {
      gate: <TwoLine main={gate.label} sub={gate.lanes.map(labelFor).join(" · ")} />,
      guard: gate.onDutySince ? (
        <TwoLine main={gate.guard ?? "Guard on duty"} sub={`${labelFor(gate.period ?? "")} shift, since ${timeOfDay(gate.onDutySince)}`} />
      ) : (
        <StatusChip status="warning" label="Nobody on duty" />
      ),
      lastScan: gate.lastCheckAt ? timeOfDay(gate.lastCheckAt) : NO_VALUE,
      status: !onDuty ? NO_VALUE : quiet ? <StatusChip status="warning" label="Not responding" /> : <StatusChip status="clear" label="Online" />,
    },
  };
}

function activityRow(check: Check, gateLabel: (post: string | null) => string): ActivityRow {
  const { outcome } = check;
  return {
    id: check.id,
    time: timeOfDay(check.occurredAt),
    person: check.person,
    visitType: check.visitType ? labelFor(check.visitType) : NO_VALUE,
    direction: check.direction,
    vehicle: check.vehicle ?? "On foot",
    plate: check.plate ?? NO_VALUE,
    gate: gateLabel(check.post),
    stay: check.direction === "out" && check.enteredAt ? duration(check.enteredAt, check.occurredAt) : NO_VALUE,
    result: outcome === "blocked" || outcome === "warning" ? outcome : "clear",
  };
}

async function LiveSite({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const { site: siteId } = await params;
  const heading = await siteHeading(siteId);
  if (!heading) return <NoAccess message="That site isn't one of yours, or it's no longer there." />;

  const query = await searchParams;
  const lane: Lane = textParam(query, "lane") === "pedestrian" ? "pedestrian" : "vehicle";
  const search = textParam(query, "q");
  const page = pageParam(query);

  const now = readClock();
  const [gates, open, counts, inside, checks, entries] = await Promise.all([
    gatesAt(siteId),
    openAlerts(siteId),
    insideCounts(siteId),
    insideNow(siteId, lane, search, page),
    latestChecks(siteId),
    entriesToday(siteId, now),
  ]);

  const path = `/control-room/${siteId}`;
  const gateLabel = (post: string | null) => gates.find((gate) => gate.post === post)?.label ?? NO_VALUE;
  const uncovered = gates.filter((gate) => gate.onDutySince === null);
  const openTotal = open.red + open.amber;

  return (
    <AppShell
      nav={appNav(user, "control-room")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow={<Breadcrumbs items={[{ label: "Control room", href: "/control-room" }, { label: heading.client }, { label: heading.name }]} />}
      title="Live at the gates"
      plain
      chips={<LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />}
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="On site now"
          value={String(counts.vehicle + counts.pedestrian)}
          icon="on-site"
          detail={`${plural(counts.vehicle, "vehicle")} · ${counts.pedestrian} on foot`}
        />
        <StatTile label="Entries today" value={String(entries)} icon="entry" detail="Since midnight" />
        <StatTile
          label="Open alerts"
          value={String(openTotal)}
          icon="alerts"
          detail={openTotal ? `${open.red} blocked · ${plural(open.amber, "warning")}` : "Nothing waiting"}
          tone={open.red > 0 ? "blocked" : "neutral"}
        />
        <StatTile
          label="Gates staffed"
          value={`${gates.length - uncovered.length} of ${gates.length}`}
          icon="guard"
          detail={uncovered[0] ? `${uncovered[0].label} has nobody on duty` : "Every post is covered"}
          tone={uncovered.length ? "blocked" : "neutral"}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Card title="Gates" subtitle="Who is on duty and when each gate last scanned">
            <DataTable
              columns={[
                { key: "gate", label: "Gate" },
                { key: "guard", label: "Guard on duty" },
                { key: "lastScan", label: "Last scan", align: "right" },
                { key: "status", label: "Device" },
              ]}
              rows={gates.map((gate) => gateRow(gate, now))}
            />
          </Card>

          <Card title="Latest checks" subtitle="Every scan, as it reaches the server">
            {checks.length ? (
              <ActivityTable rows={checks.map((check) => activityRow(check, gateLabel))} />
            ) : (
              <p className="py-8 text-center text-sm text-ink-muted">No scans at this site yet.</p>
            )}
          </Card>

          <Card title="On site now" subtitle="Longest stay first" action={<SearchBox placeholder="Search a plate or name" />}>
            <div className="mb-4">
              <Tabs
                items={[
                  { label: "Vehicles", href: path, active: lane === "vehicle", count: counts.vehicle },
                  { label: "On foot", href: `${path}?lane=pedestrian`, active: lane === "pedestrian", count: counts.pedestrian },
                ]}
              />
            </div>
            {inside.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">{search ? "Nobody on site matches that." : "Nobody here right now."}</p>
            ) : (
              <DataTable
                columns={[
                  { key: "who", label: lane === "vehicle" ? "Driver" : "Person" },
                  ...(lane === "vehicle" ? [{ key: "vehicle", label: "Vehicle" }] : []),
                  { key: "gate", label: "Came in at" },
                  { key: "stay", label: "On site", align: "right" },
                ]}
                rows={inside.rows.map((row) => ({
                  id: row.id,
                  cells: {
                    who: <TwoLine main={row.person} sub={labelFor(row.visitType)} />,
                    vehicle: <TwoLine main={row.plate ?? NO_VALUE} sub={row.vehicle ?? NO_VALUE} />,
                    gate: <TwoLine main={gateLabel(row.post)} sub={timeOfDay(row.enteredAt)} />,
                    stay: duration(row.enteredAt, now),
                  },
                }))}
              />
            )}
            <div className="-mx-6 -mb-6 mt-4">
              <Pagination page={page} total={inside.total} hrefFor={(next) => pageHref(path, query, next)} />
            </div>
          </Card>

        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Live alerts" subtitle="Blocked first, then the newest">
            <LiveAlerts alerts={open.alerts} total={openTotal} gateLabel={gateLabel} canClose={!user.roles.includes("client_viewer")} />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export default function ControlRoomSitePage({ params, searchParams }: PageProps<"/control-room/[site]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <LiveSite params={params} searchParams={searchParams} />
    </Suspense>
  );
}
