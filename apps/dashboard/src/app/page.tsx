import { ActivityTable } from "@/components/activity-table";
import { AlertsPanel } from "@/components/alerts-panel";
import { AppShell, LiveChip, RangeChip } from "@/components/app-shell";
import { Card } from "@/components/card";
import { EntriesByHour } from "@/components/entries-by-hour";
import { EntriesByType } from "@/components/entries-by-type";
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
import { navSecurityManager } from "@/demo/roles-demo";

export default function OverviewPage() {
  return (
    <AppShell
      nav={navSecurityManager}
      user={{ name: demoSite.managerFullName, role: "Security manager" }}
      eyebrow={`${demoSite.name} · ${demoSite.date}`}
      title={`Good afternoon, ${demoSite.manager}`}
      alertCount={3}
      chips={
        <>
          <RangeChip label="Today" />
          <LiveChip updatedAt={demoSite.updatedAt} />
        </>
      }
    >
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
    </AppShell>
  );
}
