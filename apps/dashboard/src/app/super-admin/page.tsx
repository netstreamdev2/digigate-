import { AlertsPanel } from "@/components/alerts-panel";
import { AppShell, LiveChip, RangeChip } from "@/components/app-shell";
import { Card } from "@/components/card";
import { DataTable, TwoLine } from "@/components/data-table";
import { EntriesByType } from "@/components/entries-by-type";
import { Icon } from "@/components/icon";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import {
  entriesBySiteType,
  navSuperAdmin,
  siteRows,
  superAdminAlerts,
  superAdminKpis,
  superAdminPowers,
  superAdminUser,
} from "@/demo/roles-demo";

const siteStatusLabel = { clear: "All clear", warning: "Needs a look", blocked: "Blocked", info: "Info" } as const;

export default function SuperAdminPage() {
  return (
    <AppShell
      nav={navSuperAdmin}
      user={superAdminUser}
      eyebrow="Every site · Wednesday 28 October"
      title="All sites"
      alertCount={7}
      chips={
        <>
          <RangeChip label="Today" />
          <LiveChip updatedAt="12:08" />
        </>
      }
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {superAdminKpis.map((kpi) => (
          <StatTile key={kpi.label} {...kpi} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Card title="Sites" subtitle="Live status at every site">
            <DataTable
              columns={[
                { key: "site", label: "Site" },
                { key: "onSite", label: "On site now", align: "right" },
                { key: "entries", label: "Entries today", align: "right" },
                { key: "alerts", label: "Open alerts", align: "right" },
                { key: "devices", label: "Devices online", align: "right" },
                { key: "status", label: "Status" },
              ]}
              rows={siteRows.map((site) => ({
                id: site.id,
                cells: {
                  site: <TwoLine main={site.name} sub={site.type} />,
                  onSite: site.onSite,
                  entries: site.entriesToday,
                  alerts: site.openAlerts,
                  devices: site.devices,
                  status: <StatusChip status={site.status} label={siteStatusLabel[site.status]} />,
                },
              }))}
            />
          </Card>
          <Card title="Entries today" subtitle="Hospitals and estates">
            <EntriesByType slices={entriesBySiteType} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Alerts at every site" subtitle="Newest first">
            <AlertsPanel alerts={superAdminAlerts} />
          </Card>
          <Card title="Full access" subtitle="What only a super admin can do">
            <ul className="space-y-3">
              {superAdminPowers.map((power) => (
                <li key={power} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-pill bg-clear-soft text-clear">
                    <Icon name="check" className="size-4" />
                  </span>
                  {power}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
