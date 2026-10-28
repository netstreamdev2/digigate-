import type { Kpi } from "@/demo/dashboard-demo";

import { Icon } from "./icon";

export function StatTile({ label, value, icon, detail, tone = "neutral" }: Kpi) {
  const blocked = tone === "blocked";
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-10 place-items-center rounded-pill ${
            blocked ? "bg-blocked-soft text-blocked" : "bg-tile-sky text-brand shadow-glow"
          }`}
        >
          <Icon name={icon} />
        </span>
        <p className="text-sm font-medium text-ink-muted">{label}</p>
      </div>
      <p className="mt-4 font-display text-4xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink-muted">{detail}</p> : null}
    </div>
  );
}
