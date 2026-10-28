import Image from "next/image";

import { ActivityTable } from "@/components/activity-table";
import { AlertsPanel } from "@/components/alerts-panel";
import { Card } from "@/components/card";
import { EntriesByHour } from "@/components/entries-by-hour";
import { EntriesByType } from "@/components/entries-by-type";
import { Icon } from "@/components/icon";
import { Sidebar } from "@/components/sidebar";
import { StatTile } from "@/components/stat-tile";
import {
  demoActivity,
  demoAlerts,
  demoBlockedVisit,
  demoEntriesByHour,
  demoEntriesByType,
  demoKpis,
  demoSite,
} from "@/demo/dashboard-demo";

export default function OverviewPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar userName={demoSite.managerFullName} userRole="Security manager" />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
        <Image src="/logo.svg" alt="DigiGate" width={104} height={33} unoptimized className="mb-6 lg:hidden" />

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-muted">
              {demoSite.name} · {demoSite.date}
            </p>
            <h1 className="mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Good afternoon, {demoSite.manager}
            </h1>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-pill border border-border bg-surface px-4 sm:w-80 sm:flex-none">
              <Icon name="search" className="size-5 shrink-0 text-ink-subtle" />
              <span className="sr-only">Search</span>
              <input
                type="search"
                placeholder="Search a plate, name or visit"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
              />
            </label>
            <button
              type="button"
              aria-label="3 open alerts"
              className="relative grid size-11 shrink-0 place-items-center rounded-pill bg-surface text-ink shadow-card"
            >
              <Icon name="bell" />
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-pill border-2 border-surface-muted bg-badge px-1 text-[11px] font-semibold text-ink-inverse">
                3
              </span>
            </button>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-pill bg-ink px-4 text-sm font-semibold text-ink-inverse">
            Today
          </span>
          <span className="inline-flex h-9 items-center gap-2 rounded-pill bg-clear-soft px-4 text-sm font-semibold text-clear">
            <span className="size-2 rounded-pill bg-clear" aria-hidden="true" />
            Live · updated {demoSite.updatedAt}
          </span>
        </div>

        <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {demoKpis.map((kpi) => (
            <StatTile key={kpi.label} {...kpi} />
          ))}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
            <Card title="Entries by hour" subtitle="Today, all gates">
              <EntriesByHour buckets={demoEntriesByHour} lastIsPartial />
            </Card>
            <Card title="Recent activity" subtitle="Latest scans across all gates">
              <ActivityTable rows={demoActivity} />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Card title="Open alerts" subtitle="Needs a security manager">
              <AlertsPanel alerts={demoAlerts} expanded={demoBlockedVisit} />
            </Card>
            <Card title="Entries today" subtitle="By visit type">
              <EntriesByType slices={demoEntriesByType} />
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
