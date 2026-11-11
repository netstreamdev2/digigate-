import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";

const TINTS = {
  sky: "bg-tile-sky",
  mint: "bg-tile-mint",
  lilac: "bg-tile-lilac",
  butter: "bg-tile-butter",
  warning: "bg-warning-soft",
  blocked: "bg-blocked-soft",
} as const;

export type Tint = keyof typeof TINTS;

/**
 * A figure as the gate app draws its home tiles: a soft colour, an icon in a chip, the number large. `flash` rings it
 * in red while there's trouble to look at, and only then, so red never sits over a zero.
 */
export function TintTile({ label, value, detail, icon, tint, flash = false }: { label: string; value: ReactNode; detail: string; icon: IconName; tint: Tint; flash?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[28px] p-5 ${TINTS[tint]} ${flash ? "dg-trouble" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid size-11 place-items-center rounded-pill bg-surface/85 ${flash ? "text-blocked" : "text-brand"}`}>
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      <p className="mt-6 font-display text-4xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 font-semibold text-ink">{label}</p>
      <p className="text-sm text-ink-muted">{detail}</p>
    </div>
  );
}
