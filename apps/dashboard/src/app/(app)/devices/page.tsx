import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { problemWhen } from "@/components/tile-colour";
import { PageSkeleton } from "@/components/skeleton";
import { Card } from "@/components/card";
import { DataTable, TwoLine } from "@/components/data-table";
import { ConfirmAction } from "@/components/dialog";
import { Pagination, Tabs } from "@/components/list";
import { FilterBar } from "@/components/filter-bar";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { asDeviceStatus, deviceBoard, deviceSummary, type DataUse, type DeviceHealth, type DeviceStatus, type FleetDevice } from "@/lib/devices";
import { ago, dataSize, MB, plural, shortDate, timeOfDay, timeWithSeconds } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { revokeDevice } from "../setup/actions";
import { PairDeviceButton } from "../setup/pair-device";

const MOST_COMPANIES = 500;
const NO_VALUE = "—";
const LOW_BATTERY = 20;
/** Below this share of the bundle left, a device's data shows amber. */
const LOW_DATA = 0.2;

const TABS: readonly { status: DeviceStatus | null; label: string }[] = [
  { status: null, label: "All" },
  { status: "quiet", label: "Not responding" },
  { status: "offline", label: "Offline" },
  { status: "online", label: "Online" },
  { status: "revoked", label: "Revoked" },
];

function DeviceChip({ device }: { device: FleetDevice }) {
  switch (device.status) {
    case "online":
      return <StatusChip status="clear" label="Online" />;
    case "quiet":
      return <StatusChip status="warning" label="Not responding" />;
    case "revoked":
      return <StatusChip status="blocked" label="Revoked" />;
    case "offline":
      return <StatusChip status="info" label={device.lastSeenAt ? "Offline" : "Never connected"} />;
  }
}

/** Long names are clipped so the table always fits, with the full name on hover. */
function Clipped({ text: value }: { text: string }) {
  return (
    <span title={value} className="block max-w-44 truncate">
      {value}
    </span>
  );
}

function scansLine({ checksToday, lastCheckAt }: FleetDevice): string {
  if (!lastCheckAt) return "No scans yet";
  return checksToday ? `${plural(checksToday, "scan")}, last ${timeOfDay(lastCheckAt)}` : `Last scan ${shortDate(lastCheckAt)}, ${timeOfDay(lastCheckAt)}`;
}

function networkWords({ network, cellGeneration }: DeviceHealth): string {
  if (network === "wifi") return "Wi-Fi";
  if (network === "cellular") return cellGeneration?.toUpperCase() ?? "Mobile data";
  return network === "none" ? "No connection" : "Connected";
}

function signalWords({ network, wifiName, cellBars }: DeviceHealth): string | null {
  if (network === "wifi") return wifiName;
  return network === "cellular" && cellBars !== null ? `${cellBars} of 4 bars` : null;
}

/** Used this bundle period against the bundle, with a bar; a bar only turns amber when little is left. */
function DataCell({ data }: { data: DataUse | null }) {
  if (!data) return <span className="text-ink-muted">Nothing yet</span>;
  const { bundleMb, usedBytes, whole } = data;
  if (bundleMb === null) return <TwoLine main={`${dataSize(usedBytes)} used`} sub={whole ? "No bundle set" : "DigiGate's own · no bundle set"} />;
  const bundleBytes = bundleMb * MB;
  const share = Math.min(1, usedBytes / bundleBytes);
  const left = Math.max(0, bundleBytes - usedBytes);
  const low = left < bundleBytes * LOW_DATA;
  return (
    <div className="flex w-36 flex-col gap-1">
      <span className="text-sm font-medium text-ink">{`${dataSize(usedBytes)} of ${dataSize(bundleBytes)}`}</span>
      <span className="h-1.5 overflow-hidden rounded-pill bg-ink/10" aria-hidden="true">
        <span className={`block h-full rounded-pill ${low ? "bg-warning" : "bg-series-1"}`} style={{ width: `${share * 100}%` }} />
      </span>
      <span className={`text-xs ${low ? "font-semibold text-warning" : "text-ink-muted"}`}>{`${dataSize(left)} left`}</span>
    </div>
  );
}

function HealthCell({ health }: { health: DeviceHealth | null }) {
  if (!health) return <span className="text-ink-muted">No report yet</span>;
  const { battery, charging, appVersion, latitude, longitude, locationAllowed, managed, simState, dataEnabled } = health;
  const low = battery !== null && battery <= LOW_BATTERY && !charging;
  const level = battery === null ? null : `${battery}%${charging ? " charging" : low ? " low" : ""}`;
  const details = [signalWords(health), appVersion ? `v${appVersion}` : null].filter(Boolean).join(" · ");
  return (
    <TwoLine
      main={
        <>
          {level ? <span className={low ? "text-warning" : undefined}>{level}</span> : null}
          {level ? " · " : null}
          {networkWords(health)}
        </>
      }
      sub={
        <span className="flex items-center gap-2">
          <span title={details} className="block max-w-36 truncate">{details || NO_VALUE}</span>
          {locationAllowed === false ? <span className="font-semibold text-warning">Location off</span> : null}
          {simState === "absent" ? <span className="font-semibold text-warning">No SIM</span> : dataEnabled === false ? <span className="font-semibold text-warning">Data off</span> : null}
          {managed === false ? <span className="font-semibold text-warning">Not locked</span> : null}
          {latitude !== null && longitude !== null ? (
            <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:text-ink">
              Map
            </a>
          ) : null}
        </span>
      }
    />
  );
}

function deviceRow(device: FleetDevice, now: number) {
  return {
    id: device.id,
    cells: {
      status: <DeviceChip device={device} />,
      device: (
        <TwoLine
          main={
            <Link href={`/devices/${device.id}`} className="font-semibold transition-colors hover:text-brand">
              <Clipped text={device.name} />
            </Link>
          }
          sub={`Paired ${shortDate(device.pairedAt)}`}
        />
      ),
      where: (
        <TwoLine
          main={
            <Link href={`/control-room/${device.siteId}`} className="transition-colors hover:text-brand">
              <Clipped text={device.site} />
            </Link>
          }
          sub={<Clipped text={device.company} />}
        />
      ),
      duty: device.guard ? <TwoLine main={device.guard} sub={device.post ?? NO_VALUE} /> : <span className="text-ink-muted">{device.status === "revoked" ? NO_VALUE : "Nobody on duty"}</span>,
      activity: <TwoLine main={device.lastSeenAt ? `Seen ${ago(device.lastSeenAt, now)}` : "Never seen"} sub={scansLine(device)} />,
      health: <HealthCell health={device.health} />,
      data: <DataCell data={device.data} />,
      action:
        device.status === "revoked" ? null : (
          <ConfirmAction
            label="Revoke"
            title={`Revoke ${device.name}?`}
            confirmLabel="Yes, revoke it"
            pendingLabel="Revoking…"
            tone="danger"
            icon="result-warning"
            action={revokeDevice}
            fields={{ id: device.id }}
          >
            It stops working with DigiGate, signs out whoever is on it, and wipes its guards and data the next time it connects. To use it again you&apos;d pair it with a new code.
          </ConfirmAction>
        ),
    },
  };
}

async function Devices({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const isSuperUser = user.roles.includes("super_user");
  if (!isSuperUser && !user.roles.includes("admin")) redirect("/control-room");

  const query = await searchParams;
  const search = textParam(query, "q");
  const status = asDeviceStatus(textParam(query, "status"));
  const page = pageParam(query);

  const supabase = await supabaseServer();
  const companies = isSuperUser ? must(await supabase.from("organisations").select("id, name").order("name").limit(MOST_COMPANIES)) : [];
  const company = companies.find((row) => row.id === textParam(query, "company"))?.id ?? "";

  const filter = { search, company };
  const [{ devices, total }, summary] = await Promise.all([deviceBoard(filter, status, page), deviceSummary(filter)]);

  const now = readClock();
  const inService = summary.quiet + summary.offline + summary.online;
  const everyDevice = inService + summary.revoked;
  const active = TABS.find((tab) => tab.status === status);

  return (
    <AppShell
      company={company ? await companyBrand(company) : null}
      eyebrow={isSuperUser ? "Every handheld at every company, trouble first" : "Every handheld your company runs, trouble first"}
      title="Devices"
      chips={
        <>
          <LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />
          <div className="sm:ml-auto">
            <PairDeviceButton company={companies.find((row) => row.id === company)} />
          </div>
        </>
      }
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="In service" value={String(inService)} icon="device" detail={summary.revoked ? `${summary.revoked} more revoked` : "None revoked"} />
        <StatTile label="Online now" value={String(summary.online)} icon="synced" detail="Heard from in the last 3 minutes" />
        <StatTile
          label="Not responding"
          value={String(summary.quiet)}
          icon="result-warning"
          detail={summary.quiet ? `${plural(summary.quiet, "guard")} on duty on these` : "Every guard's device is answering"}
          meaning={problemWhen(summary.quiet)}
        />
        <StatTile label="Offline" value={String(summary.offline)} icon="offline" detail="Nobody on duty on these" />
      </section>

      <div className="mt-6">
        <Tabs
          items={TABS.map((tab) => ({
            label: tab.label,
            href: pageHref("/devices", { ...query, status: tab.status ?? undefined }, 1),
            active: tab.status === status,
            count: tab.status ? summary[tab.status] : everyDevice,
          }))}
        />
      </div>

      <FilterBar label="Filter the devices">
        <SearchBox placeholder="Search a device, site or company" />
        {isSuperUser ? <FilterSelect name="company" label="All companies" options={companies.map((row) => ({ value: row.id, label: row.name }))} /> : null}
      </FilterBar>

      <Card className="mt-6" title={active?.label ?? "All"} subtitle="A device that stops answering keeps working offline. Its scans arrive when it reconnects.">
        {devices.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{everyDevice === 0 && !search ? "No devices yet. Use Pair a device to add the first one." : "Nothing here right now."}</p>
        ) : (
          <DataTable
            columns={[
              { key: "status", label: "Status" },
              { key: "device", label: "Device" },
              { key: "where", label: "Where" },
              { key: "duty", label: "On duty" },
              { key: "activity", label: "Activity" },
              { key: "health", label: "Health" },
              { key: "data", label: "Data this period" },
              { key: "action", label: "", align: "right" },
            ]}
            rows={devices.map((device) => deviceRow(device, now))}
          />
        )}
        <div className="-mx-6 -mb-6 mt-4">
          <Pagination page={page} total={total} hrefFor={(next) => pageHref("/devices", query, next)} />
        </div>
      </Card>
    </AppShell>
  );
}

export default function DevicesPage({ searchParams }: PageProps<"/devices">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Devices searchParams={searchParams} />
    </Suspense>
  );
}
