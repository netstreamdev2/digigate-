import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";
import { tileColour, type TileMeaning } from "./tile-colour";

type PanelProps = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A frosted panel floating over the page's wash of colour. */
export function GlassPanel({ title, subtitle, action, children, className = "" }: PanelProps) {
  return (
    <section className={`dg-glass min-w-0 p-6 ${className}`}>
      {title ? (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export type Trend = {
  text: string;
  direction: "up" | "down" | "flat";
  /** Whether this direction is good news. Colour only ever adds to the arrow and the words. */
  feeling: "good" | "bad" | "neutral";
};

const FEELING_COLOUR: Record<Trend["feeling"], string> = {
  good: "text-clear",
  bad: "text-blocked",
  neutral: "text-ink-subtle",
};

export function TrendNote({ trend }: { trend: Trend }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
      {trend.direction === "flat" ? null : (
        <svg viewBox="0 0 8 7" aria-hidden="true" className={`size-2 shrink-0 ${FEELING_COLOUR[trend.feeling]}`}>
          <path d={trend.direction === "up" ? "M4 0 8 7H0Z" : "M0 0H8L4 7Z"} fill="currentColor" />
        </svg>
      )}
      <span className="truncate">{trend.text}</span>
    </p>
  );
}

type StatProps = {
  label: string;
  value: string;
  icon: IconName;
  trend?: Trend;
  note?: string;
  /** Sets the tile's colour: entries green, exits purple, problems red, warnings amber (components/tile-colour.ts). */
  meaning?: TileMeaning;
};

/** One headline figure on glass. */
export function GlassStat({ label, value, icon, trend, note, meaning = "neutral" }: StatProps) {
  const { style, chip } = tileColour(meaning);
  return (
    <div className="dg-glass dg-tile p-5" style={style}>
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-pill ${chip}`}>
          <Icon name={icon} />
        </span>
        <p className="min-w-0 truncate text-sm font-medium text-ink-muted">{label}</p>
      </div>
      <p className="mt-4 font-display text-4xl font-semibold tabular-nums tracking-tight">{value}</p>
      {trend ? <TrendNote trend={trend} /> : note ? <p className="mt-1 truncate text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}
