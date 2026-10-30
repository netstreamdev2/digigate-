import { ActivityTable } from "@/components/activity-table";
import { AlertsPanel } from "@/components/alerts-panel";
import { AppShell, LiveChip } from "@/components/app-shell";
import { Card } from "@/components/card";
import { DataTable, TwoLine } from "@/components/data-table";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { demoActivity, demoAlerts, demoBlockedVisit } from "@/demo/dashboard-demo";
import { controlRoomKpis, controlRoomUser, gateRows, navControlRoom } from "@/demo/roles-demo";

export default function ControlRoomPage() {
  return (
    <AppShell
      nav={navControlRoom}
      user={controlRoomUser}
      eyebrow="Demo Hospital · Control room"
      title="Live at the gates"
      alertCount={3}
      chips={<LiveChip updatedAt="12:08" />}
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {controlRoomKpis.map((kpi) => (
          <StatTile key={kpi.label} {...kpi} />
        ))}
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
              rows={gateRows.map((gate) => ({
                id: gate.id,
                cells: {
                  gate: <TwoLine main={gate.gate} sub={gate.lane} />,
                  guard: gate.guard,
                  lastScan: gate.lastScan,
                  status: <StatusChip status={gate.status} label={gate.statusLabel} />,
                },
              }))}
            />
          </Card>
          <Card title="Live activity" subtitle="Every scan, as it happens">
            <ActivityTable rows={demoActivity} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Live alerts" subtitle="Handle the blocked ones first">
            <AlertsPanel alerts={demoAlerts} expanded={demoBlockedVisit} />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
