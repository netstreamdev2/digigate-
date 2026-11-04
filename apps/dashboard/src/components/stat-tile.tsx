import { Icon, type IconName } from "./icon";

export type Kpi = {
  label: string;
  value: string;
  icon: IconName;
  detail?: string;
  /** Warning is for something nearing its limit, such as a car park almost full; blocked is for one past it. */
  tone?: "neutral" | "warning" | "blocked";
};

export function StatTile({ label, value, icon, detail, tone = "neutral" }: Kpi) {
  const toneClass = tone === "blocked" ? "bg-blocked-soft text-blocked" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-tile-sky text-brand shadow-glow";
  return (
    <div className="dg-glass p-5">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-10 place-items-center rounded-pill ${toneClass}`}
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
