import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { CountUp } from "@/components/count-up";
import { DataTable, TwoLine } from "@/components/data-table";
import { DataRing, LiveDot } from "@/components/device-signs";
import { FilterBar } from "@/components/filter-bar";
import { Pagination, Tabs } from "@/components/list";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { Rail } from "@/components/rail";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { Segmented } from "@/components/segmented";
import { PageSkeleton } from "@/components/skeleton";
import { TintTile } from "@/components/tint-tile";
import { companyBrand } from "@/lib/company-brand";
import { attentionOf } from "@/lib/device-attention";
import { asDeviceStatus, deviceBoard, deviceSummary, type DeviceStatus, type FleetDevice } from "@/lib/devices";
import { ago, dataSize, MB, plural, shortDate, timeWithSeconds } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { PairDeviceButton } from "../setup/pair-device";
import { DeviceCard } from "./device-card";

const MOST_COMPANIES = 500;
const NO_VALUE = "—";
/** The rail is a short list: the worst on this page, never the whole fleet. */
const MOST_IN_RAIL = 12;

const TABS: readonly { status: DeviceStatus | null; label: string }[] = [
  { status: null, label: "All" },
  { status: "quiet", label: "Not responding" },
  { status: "offline", label: "Offline" },
  { status: "online", label: "Online" },
  { status: "revoked", label: "Revoked" },
];

const STATUS_WORDS: Record<DeviceStatus, string> = { online: "Online", quiet: "Not responding", offline: "Offline", revoked: "Revoked" };
const STATUS_TONE = { online: "clear", quiet: "blocked", offline: "neutral", revoked: "neutral" } as const;

/** The same handhelds as a dense table, for anyone scanning a long page by eye. */
function DeviceTable({ devices, now, full }: { devices: readonly FleetDevice[]; now: number; full: boolean }) {
  return (
    <DataTable
      columns={[
        { key: "device", label: "Device" },
        { key: "where", label: "Where" },
        { key: "duty", label: "On duty" },
        { key: "seen", label: "Seen" },
        full ? { key: "data", label: "Data this period" } : { key: "battery", label: "Battery" },
      ]}
      rows={devices.map((device) => ({
        id: device.id,
        cells: {
          device: (
            <TwoLine
              main={
                <Link href={`/devices/${device.id}`} className="flex items-center gap-2 font-semibold transition-colors hover:text-brand">
                  <LiveDot tone={STATUS_TONE[device.status]} live={device.status === "online" || device.status === "quiet"} />
                  <span className="block max-w-44 truncate">{device.name}</span>
                </Link>
              }
              sub={`${STATUS_WORDS[device.status]} · paired ${shortDate(device.pairedAt)}`}
            />
          ),
          where: <TwoLine main={device.site} sub={device.company} />,
          duty: device.guard ? <TwoLine main={device.guard} sub={device.post ?? NO_VALUE} /> : <span className="text-ink-muted">Nobody</span>,
          seen: <TwoLine main={device.lastSeenAt ? ago(device.lastSeenAt, now) : "Never"} sub={device.checksToday ? `${plural(device.checksToday, "scan")} today` : "No scans today"} />,
          data: device.data ? (
            <span className="flex items-center gap-3">
              <DataRing usedBytes={device.data.usedBytes} bundleBytes={device.data.bundleMb ? device.data.bundleMb * MB : null} />
              <TwoLine main={`${dataSize(device.data.usedBytes)} used`} sub={device.data.bundleMb ? `of ${dataSize(device.data.bundleMb * MB)}` : "No bundle set"} />
            </span>
          ) : (
            <span className="text-ink-muted">Nothing yet</span>
          ),
          battery: <TwoLine main={device.health?.battery === null || device.health?.battery === undefined ? NO_VALUE : `${device.health.battery}%`} sub={device.health?.charging ? "Charging" : "Not charging"} />,
        },
      }))}
    />
  );
}

async function Devices({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const isSuperUser = user.roles.includes("super_user");
  // A company's admins, managers and control room see their handhelds' battery, network and location; the rest is a super user's.
  if (!isSuperUser && !["admin", "manager", "control_room"].some((role) => user.roles.includes(role))) redirect("/control-room");

  const query = await searchParams;
  const search = textParam(query, "q");
  const status = asDeviceStatus(textParam(query, "status"));
  const page = pageParam(query);
  const asTable = textParam(query, "view") === "table";

  const supabase = await supabaseServer();
  const companies = isSuperUser ? must(await supabase.from("organisations").select("id, name").order("name").limit(MOST_COMPANIES)) : [];
  const company = companies.find((row) => row.id === textParam(query, "company"))?.id ?? "";

  const filter = { search, company };
  const [{ devices, total }, summary] = await Promise.all([deviceBoard(filter, status, page), deviceSummary(filter)]);

  const now = readClock();
  const inService = summary.quiet + summary.offline + summary.online;
  const everyDevice = inService + summary.revoked;
  const active = TABS.find((tab) => tab.status === status);
  const needAttention = page === 1 ? devices.filter((device) => attentionOf(device).length > 0).slice(0, MOST_IN_RAIL) : [];

  return (
    <AppShell
      company={company ? await companyBrand(company) : null}
      eyebrow={isSuperUser ? "Every handheld at every company, trouble first" : "Every handheld your company runs, trouble first"}
      title="Devices"
      chips={
        <>
          <LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />
          {isSuperUser || user.roles.includes("admin") ? (
            <div className="sm:ml-auto">
              <PairDeviceButton company={companies.find((row) => row.id === company)} />
            </div>
          ) : null}
        </>
      }
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TintTile tint="sky" icon="device" label="In service" value={<CountUp value={inService} />} detail={summary.revoked ? `${summary.revoked} more revoked` : "None revoked"} />
        <TintTile tint="mint" icon="synced" label="Online now" value={<CountUp value={summary.online} />} detail="Heard from in the last 3 minutes" />
        <TintTile
          tint={summary.quiet ? "blocked" : "lilac"}
          flash={summary.quiet > 0}
          icon="result-warning"
          label="Not responding"
          value={<CountUp value={summary.quiet} />}
          detail={summary.quiet ? `${plural(summary.quiet, "guard")} on duty on these` : "Every guard's handheld is answering"}
        />
        <TintTile tint="butter" icon="offline" label="Offline" value={<CountUp value={summary.offline} />} detail="Nobody on duty on these" />
      </section>

      {needAttention.length > 0 ? (
        <section aria-label="Needs attention" className="mt-8">
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg font-semibold tracking-tight">Needs attention</h2>
            <p className="text-sm text-ink-muted">{plural(needAttention.length, "handheld")} on this page</p>
          </div>
          <Rail label="Handhelds that need attention">
            {needAttention.map((device, index) => (
              <DeviceCard key={device.id} device={device} now={now} index={index} narrow full={isSuperUser} />
            ))}
          </Rail>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs
          items={TABS.map((tab) => ({
            label: tab.label,
            href: pageHref("/devices", { ...query, status: tab.status ?? undefined }, 1),
            active: tab.status === status,
            count: tab.status ? summary[tab.status] : everyDevice,
          }))}
        />
        <Segmented
          label="Show the devices as"
          value={asTable ? "table" : "cards"}
          options={[
            { value: "cards", label: "Cards", href: pageHref("/devices", { ...query, view: undefined }, page) },
            { value: "table", label: "Table", href: pageHref("/devices", { ...query, view: "table" }, page) },
          ]}
        />
      </div>

      <FilterBar label="Filter the devices">
        <SearchBox placeholder="Search a device, site or company" />
        {isSuperUser ? <FilterSelect name="company" label="All companies" options={companies.map((row) => ({ value: row.id, label: row.name }))} /> : null}
      </FilterBar>

      {devices.length === 0 ? (
        <Card className="mt-6" title={active?.label ?? "All"}>
          <p className="py-8 text-center text-sm text-ink-muted">{everyDevice === 0 && !search ? "No devices yet. Use Pair a device to add the first one." : "Nothing here right now."}</p>
        </Card>
      ) : asTable ? (
        <Card className="mt-6" title={active?.label ?? "All"} subtitle="A device that stops answering keeps working offline. Its scans arrive when it reconnects.">
          <DeviceTable devices={devices} now={now} full={isSuperUser} />
        </Card>
      ) : (
        <ul className="dg-ripple mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {devices.map((device, index) => (
            <li key={device.id} className="flex">
              <DeviceCard device={device} now={now} index={index} full={isSuperUser} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Pagination page={page} total={total} hrefFor={(next) => pageHref("/devices", query, next)} />
      </div>
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
