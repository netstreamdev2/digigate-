import { AppShell, RangeChip } from "@/components/app-shell";
import { Card } from "@/components/card";
import { DataTable, TwoLine } from "@/components/data-table";
import { Icon } from "@/components/icon";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { deviceRows, guardRows, navSiteAdmin, pendingStaff, siteAdminKpis, siteAdminUser } from "@/demo/roles-demo";

const siteRules = [
  { label: "Visiting hours", value: "08:00 to 20:00" },
  { label: "Visitors may stay", value: "4 hours" },
  { label: "Gate screen locks after", value: "5 minutes idle" },
  { label: "Visitor details kept for", value: "90 days" },
] as const;

export default function SiteAdminPage() {
  return (
    <AppShell
      nav={navSiteAdmin}
      user={siteAdminUser}
      eyebrow="Demo Hospital · Wednesday 28 October"
      title="Demo Hospital"
      alertCount={3}
      chips={<RangeChip label="Site admin" />}
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {siteAdminKpis.map((kpi) => (
          <StatTile key={kpi.label} {...kpi} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Card title="Waiting for approval" subtitle="Staff enrolled at the gate. They are treated as visitors until approved.">
            <ul className="divide-y divide-border">
              {pendingStaff.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="grid size-10 place-items-center rounded-pill bg-tile-lilac font-display text-sm font-semibold text-brand">
                    {person.name.replace("Dr ", "").slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{person.name}</p>
                    <p className="text-xs text-ink-muted">
                      {person.category} · enrolled by {person.enrolledBy} at {person.at}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="h-9 rounded-pill bg-ink px-4 text-sm font-semibold text-ink-inverse">
                      Approve
                    </button>
                    <button type="button" className="h-9 rounded-pill border border-border bg-surface px-4 text-sm font-semibold">
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Guards and supervisors" subtitle="Who can sign in at this site's gates">
            <DataTable
              columns={[
                { key: "name", label: "Name" },
                { key: "number", label: "Employee number" },
                { key: "where", label: "Where" },
                { key: "status", label: "Status" },
              ]}
              rows={guardRows.map((guard) => ({
                id: guard.id,
                cells: {
                  name: <TwoLine main={guard.name} sub={guard.role} />,
                  number: guard.employeeNumber,
                  where: <span className="text-ink-muted">{guard.where}</span>,
                  status: <StatusChip status={guard.status} label={guard.statusLabel} />,
                },
              }))}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Gate devices" subtitle="Each gate's handheld scanner">
            <ul className="space-y-3">
              {deviceRows.map((device) => (
                <li key={device.id} className="rounded-md border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Icon name="device" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                      <div>
                        <p className="font-medium">{device.name}</p>
                        <p className="text-xs text-ink-muted">{device.gate}</p>
                      </div>
                    </div>
                    <StatusChip status={device.status} label={device.status === "clear" ? "Online" : "Offline"} />
                  </div>
                  <p className="mt-2 text-xs text-ink-subtle">{device.sync}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Site rules" subtitle="Set by the site admin">
            <dl className="space-y-3">
              {siteRules.map((rule) => (
                <div key={rule.label} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-ink-muted">{rule.label}</dt>
                  <dd className="font-semibold">{rule.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
