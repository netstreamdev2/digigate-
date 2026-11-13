import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { CountUp } from "@/components/count-up";
import { FilterBar } from "@/components/filter-bar";
import { Pagination, Tabs } from "@/components/list";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { TintTile } from "@/components/tint-tile";
import { companyBrand } from "@/lib/company-brand";
import { asDeviceStatus, deviceBoard, deviceSummary, type DeviceStatus } from "@/lib/devices";
import { plural, timeWithSeconds } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

import { PairDeviceButton } from "../setup/pair-device";
import { DeviceCard } from "./device-card";

const MOST_COMPANIES = 500;

// The first tab, with no status in the address, is every handheld in service: revoked ones only on their own tab.
const TABS: readonly { status: DeviceStatus | null; label: string }[] = [
  { status: null, label: "In service" },
  { status: "quiet", label: "Not responding" },
  { status: "offline", label: "Offline" },
  { status: "online", label: "Online" },
  { status: "revoked", label: "Revoked" },
];

// Each handheld appears once, as a card (13 November): a separate "needs attention" row showed the same handhelds
// twice and a table view was one more thing to explain.
async function Devices({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const acrossCompanies = isDigiGateStaff(user);
  // Company staff see battery, network and location; DigiGate staff see the full handheld diagnostics.
  if (!acrossCompanies && !["admin", "manager", "control_room"].some((role) => user.roles.includes(role))) redirect("/control-room");

  const query = await searchParams;
  const search = textParam(query, "q");
  const status = asDeviceStatus(textParam(query, "status"));
  const page = pageParam(query);

  const supabase = await supabaseServer();
  const companies = acrossCompanies ? must(await supabase.from("organisations").select("id, name").order("name").limit(MOST_COMPANIES)) : [];
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
      eyebrow={acrossCompanies ? "Every handheld at every company, trouble first" : "Every handheld your company runs, trouble first"}
      title="Devices"
      chips={
        <>
          <LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />
          {acrossCompanies || user.roles.includes("admin") ? (
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

      <div className="mt-8">
        <Tabs
          items={TABS.map((tab) => ({
            label: tab.label,
            href: pageHref("/devices", { ...query, status: tab.status ?? undefined }, 1),
            active: tab.status === status,
            count: tab.status ? summary[tab.status] : inService,
          }))}
        />
      </div>

      <FilterBar label="Filter the devices">
        <SearchBox placeholder="Search a device, site or company" />
        {acrossCompanies ? <FilterSelect name="company" label="All companies" options={companies.map((row) => ({ value: row.id, label: row.name }))} /> : null}
      </FilterBar>

      {devices.length === 0 ? (
        <Card className="mt-6" title={active?.label ?? "All"}>
          <p className="py-8 text-center text-sm text-ink-muted">{everyDevice === 0 && !search ? "No devices yet. Use Pair a device to add the first one." : "Nothing here right now."}</p>
        </Card>
      ) : (
        <ul className="dg-ripple mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {devices.map((device, index) => (
            <li key={device.id} className="flex">
              <DeviceCard device={device} now={now} index={index} full={acrossCompanies} />
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
