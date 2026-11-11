import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageSkeleton } from "@/components/skeleton";
import { Card } from "@/components/card";
import { DataTable, TwoLine } from "@/components/data-table";
import { Breadcrumbs, Pagination, Tabs } from "@/components/list";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { StatTile } from "@/components/stat-tile";
import { problemWhen, warningWhen } from "@/components/tile-colour";
import { StatusChip } from "@/components/status-chip";
import {
  entriesToday,
  gatesAt,
  insideCounts,
  insideNow,
  latestChecks,
  launchGraceEnd,
  longestInside,
  overstaysAt,
  siteDay,
  siteParking,
  type SiteDay,
  openAlerts,
  siteHeading,
  type Gate,
  type Lane,
} from "@/lib/control-room";
import { checkRowOf } from "@/lib/check-rows";
import { siteCompanyBrand } from "@/lib/company-brand";
import { duration, labelFor, plural, shortDate, timeOfDay, timeWithSeconds } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";

import { CheckActivity } from "../check-activity";
import { LiveAlerts } from "../live-alerts";
import { SelfieButton } from "../selfie-button";
import { StayCell } from "../stay-cell";

/** Handhelds sync every minute, so three missed rounds means this one has gone quiet. */
const DEVICE_QUIET_MS = 3 * 60_000;

const NO_VALUE = "—";

/** What the control room can see of the guard's photo and whether they've said they're away. */
function GateNotes({ gate, now }: { gate: Gate; now: number }) {
  const away = gate.awayUntil !== null && new Date(gate.awayUntil).getTime() > now;
  const selfie = !gate.shiftId ? null : gate.hasSelfie ? (
    <SelfieButton shiftId={gate.shiftId} guard={gate.guard ?? "Guard on duty"} />
  ) : gate.selfie === "skipped" ? (
    <StatusChip status="warning" label="No selfie" />
  ) : gate.selfie === "taken" ? (
    <span className="text-xs text-ink-muted">Selfie on its way</span>
  ) : null;
  if (!away && !selfie) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {selfie}
      {away && gate.awayUntil ? <StatusChip status="info" label={`${gate.awayReason ?? "Stepping away"}, back by ${timeOfDay(gate.awayUntil)}`} /> : null}
    </div>
  );
}

function gateRow(gate: Gate, now: number) {
  const onDuty = gate.onDutySince !== null;
  const quiet = gate.deviceSeenAt === null || now - new Date(gate.deviceSeenAt).getTime() > DEVICE_QUIET_MS;
  return {
    id: gate.post,
    cells: {
      gate: <TwoLine main={gate.label} sub={gate.lanes.map(labelFor).join(" · ")} />,
      guard: gate.onDutySince ? (
        <>
          <TwoLine main={gate.guard ?? "Guard on duty"} sub={`${labelFor(gate.period ?? "")} shift, since ${timeOfDay(gate.onDutySince)}`} />
          <GateNotes gate={gate} now={now} />
        </>
      ) : (
        <StatusChip status="warning" label="Nobody on duty" />
      ),
      lastScan: gate.lastCheckAt ? timeOfDay(gate.lastCheckAt) : NO_VALUE,
      status: !onDuty ? NO_VALUE : quiet ? <StatusChip status="warning" label="Not responding" /> : <StatusChip status="clear" label="Online" />,
    },
  };
}

/** The hour with the most scans so far today, so a control room can see its rush coming. */
function busiestHour(today: SiteDay): string {
  const most = Math.max(...today.hours);
  if (most === 0) return "No scans yet today";
  const hour = today.hours.indexOf(most);
  return `Busiest ${String(hour).padStart(2, "0")}:00 to ${String((hour + 1) % 24).padStart(2, "0")}:00, ${plural(most, "scan")}`;
}

// A car park almost full is a warning; full is blocked, since the gate should stop letting cars in.
const PARKING_NEARLY_FULL = 0.9;

function CarParkTile({ vehicles, parking }: { vehicles: number; parking: { open: boolean; spaces: number | null } }) {
  if (parking.open || !parking.spaces) {
    return <StatTile label="Car park" value={String(vehicles)} icon="vehicle" detail="Open parking, not counted" />;
  }
  const free = Math.max(0, parking.spaces - vehicles);
  const share = vehicles / parking.spaces;
  return (
    <StatTile
      label="Car park"
      value={`${vehicles} of ${parking.spaces}`}
      icon="vehicle"
      detail={free === 0 ? "Full" : `${plural(free, "space")} free`}
      meaning={free === 0 ? "problem" : share >= PARKING_NEARLY_FULL ? "warning" : "neutral"}
    />
  );
}

/** How long the check's visit has lasted: so far while it's still going, in full once it's over. */
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
  const [gates, open, counts, inside, checks, entries, today, parking, longest, overstays, graceEnd] = await Promise.all([
    gatesAt(siteId),
    openAlerts(siteId),
    insideCounts(siteId),
    insideNow(siteId, lane, search, page),
    latestChecks(siteId),
    entriesToday(siteId, now),
    siteDay(siteId, now),
    siteParking(siteId),
    longestInside(siteId),
    overstaysAt(siteId, now),
    launchGraceEnd(siteId, now),
  ]);

  const path = `/control-room/${siteId}`;
  const gateLabel = (post: string | null) => gates.find((gate) => gate.post === post)?.label ?? NO_VALUE;
  const uncovered = gates.filter((gate) => gate.onDutySince === null);
  const openTotal = open.red + open.amber;
  // An alert with no check behind it is about the guard on that post, not someone at the gate.
  const alerts = open.alerts.map((alert) => (alert.person ? alert : { ...alert, person: gates.find((gate) => gate.post === alert.post)?.guard ?? null }));

  return (
    <AppShell
      company={await siteCompanyBrand(siteId)}
      siteId={siteId}
      eyebrow={<Breadcrumbs items={[{ label: "Control room", href: "/control-room" }, { label: heading.name }]} />}
      title="Live at the gates"
      actions={
        <Link
          href={`/control-room/${siteId}/evacuation`}
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-blocked px-5 text-sm font-semibold text-ink-inverse shadow-floating transition hover:bg-ink"
        >
          <Icon name="evacuation" className="size-5" />
          Evacuation list
        </Link>
      }
      chips={<LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />}
    >
      {graceEnd ? (
        <div role="note" className="mt-6 flex items-start gap-3 rounded-lg bg-tile-butter px-4 py-3 text-sm">
          <Icon name="duration" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>
            <span className="font-semibold">{`Launch grace: ${duration(now, graceEnd)} left.`}</span>
            {" Cars leaving with no DigiGate entry are asked about at the gate, not stopped, until "}
            <span className="font-semibold">{`${shortDate(graceEnd)}, ${timeOfDay(graceEnd)}`}</span>
            {". Each one shows under Checks as \u201cCame in before DigiGate\u201d."}
          </p>
        </div>
      ) : null}

      <LiveAlerts alerts={alerts} total={openTotal} gateLabel={gateLabel} canClose={!user.roles.includes("client_viewer")} />

      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="On site now"
          value={String(counts.vehicle + counts.pedestrian)}
          icon="on-site"
          detail={`${plural(counts.vehicle, "vehicle")} · ${plural(counts.pedestrian, "pedestrian")}`}
        />
        <StatTile label="Entries today" value={String(entries)} icon="entry" detail={busiestHour(today)} meaning="entry" />
        <StatTile label="Exits today" value={String(today.exits)} icon="exit" detail="Since midnight" meaning="exit" />
        <StatTile
          label="Open alerts"
          value={String(openTotal)}
          icon="alerts"
          detail={openTotal ? `${open.red} blocked · ${plural(open.amber, "warning")}` : "Nothing waiting"}
          meaning={open.red > 0 ? "problem" : warningWhen(open.amber)}
        />
        <StatTile
          label="Gates staffed"
          value={`${gates.length - uncovered.length} of ${gates.length}`}
          icon="guard"
          detail={uncovered[0] ? `${uncovered[0].label} has nobody on duty` : "Every access point is covered"}
          meaning={problemWhen(uncovered.length)}
        />
        <CarParkTile vehicles={counts.vehicle} parking={parking} />
        <StatTile
          label="Stopped at the gate"
          value={String(today.blocked)}
          icon="result-blocked"
          detail={today.blocked ? `${today.overrides} let through by a supervisor · ${today.turnedAway} turned away` : "Nobody stopped today"}
          meaning={problemWhen(today.blocked)}
        />
        <StatTile
          label="Average stay today"
          value={today.timedExits ? duration(0, (today.stayMinutes / today.timedExits) * 60_000) : NO_VALUE}
          icon="duration"
          detail={longest ? `Longest on site now: ${duration(longest, now)}` : "Nobody on site"}
        />
      </section>

      <div className="mt-6 min-w-0">
        <div className="min-w-0">
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
        </div>

      </div>

      {/* The checks and who is on site run the full width of the page, so their tables fit without scrolling sideways. */}
      <div className="mt-6 flex min-w-0 flex-col gap-6">
        <Card
          title="Checks"
          subtitle="The latest scans, as they reach the server"
          action={
            <Link href={`/checks?site=${siteId}`} className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-surface/70 px-3.5 text-sm font-semibold text-ink transition hover:bg-surface">
              Every check here
              <Icon name="chevron-right" className="size-4" />
            </Link>
          }
        >
          {checks.length ? (
            <CheckActivity rows={checks.map((check) => checkRowOf(check, gateLabel(check.post), now))} />
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">No scans at this site yet.</p>
          )}
        </Card>

        <Card title="On site now" subtitle={overstays ? `Longest stay first · ${plural(overstays, "visit")} over their time` : "Longest stay first"} action={<SearchBox placeholder="Name, plate or car: blue Mercedes" />}>
          <div className="mb-4">
            <Tabs
              items={[
                { label: "Vehicles", href: path, active: lane === "vehicle", count: counts.vehicle },
                { label: "Pedestrians", href: `${path}?lane=pedestrian`, active: lane === "pedestrian", count: counts.pedestrian },
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
                { key: "gate", label: "Came in" },
                { key: "stay", label: "On site", align: "right" },
              ]}
              rows={inside.rows.map((row) => ({
                id: row.id,
                cells: {
                  who: <TwoLine main={row.person} sub={labelFor(row.visitType)} />,
                  vehicle: <TwoLine main={row.plate ?? NO_VALUE} sub={row.vehicle ?? NO_VALUE} />,
                  gate: <TwoLine main={timeOfDay(row.enteredAt)} sub={gateLabel(row.post)} />,
                  stay: <StayCell enteredAt={row.enteredAt} expectedUntil={row.expectedUntil} now={now} />,
                },
              }))}
            />
          )}
          <div className="-mx-6 -mb-6 mt-4">
            <Pagination page={page} total={inside.total} hrefFor={(next) => pageHref(path, query, next)} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function ControlRoomSitePage({ params, searchParams }: PageProps<"/control-room/[site]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="tiles" />}>
      <LiveSite params={params} searchParams={searchParams} />
    </Suspense>
  );
}
