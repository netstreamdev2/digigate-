import { AppShell, RangeChip } from "@/components/app-shell";
import { Card } from "@/components/card";
import { DataTable } from "@/components/data-table";
import { EntriesByHour } from "@/components/entries-by-hour";
import { EntriesByType } from "@/components/entries-by-type";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { demoEntriesByType } from "@/demo/dashboard-demo";
import { guardPerformance, kpiTiles, kpiUser, navKpi, weekEntriesByHour } from "@/demo/roles-demo";

const TARGET_SECONDS = 15;

export default function KpiPage() {
  return (
    <AppShell
      nav={navKpi}
      user={kpiUser}
      eyebrow="Demo Hospital · 22 to 28 October"
      title="How the gates performed"
      chips={<RangeChip label="This week" />}
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiTiles.map((kpi) => (
          <StatTile key={kpi.label} {...kpi} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Card title="Busiest hours" subtitle="Average entries per hour this week">
            <EntriesByHour buckets={weekEntriesByHour} />
          </Card>
          <Card title="Guard performance" subtitle="This week, all gates">
            <DataTable
              columns={[
                { key: "name", label: "Guard" },
                { key: "shifts", label: "Shifts", align: "right" },
                { key: "scans", label: "Scans", align: "right" },
                { key: "average", label: "Time per car", align: "right" },
                { key: "manual", label: "Typed by hand", align: "right" },
                { key: "overrides", label: "Overrides", align: "right" },
                { key: "target", label: "Against target" },
              ]}
              rows={guardPerformance.map((guard) => {
                const onTarget = Number.parseInt(guard.average, 10) < TARGET_SECONDS;
                return {
                  id: guard.id,
                  cells: {
                    name: <span className="font-medium">{guard.name}</span>,
                    shifts: guard.shifts,
                    scans: guard.scans,
                    average: guard.average,
                    manual: guard.manual,
                    overrides: guard.overrides,
                    target: <StatusChip status={onTarget ? "clear" : "warning"} label={onTarget ? "On target" : "Slower than target"} />,
                  },
                };
              })}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Entries by visit type" subtitle="Today">
            <EntriesByType slices={demoEntriesByType} />
          </Card>
          <Card title="Reading these numbers" subtitle="What a KPI supervisor watches">
            <ul className="space-y-3 text-sm text-ink-muted">
              <li>Time per car should stay under 15 seconds, even at 08:00.</li>
              <li>Many entries typed by hand can mean a damaged scanner or a guard skipping the scan.</li>
              <li>Overrides are allowed, but each one is checked against its reason.</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
