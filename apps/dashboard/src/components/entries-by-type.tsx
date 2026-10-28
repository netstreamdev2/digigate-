"use client";

import { seriesColors } from "@digigate/design";
import { useState } from "react";

type Slice = {
  label: string;
  entries: number;
};

type Props = {
  slices: readonly Slice[];
};

const SIZE = 168;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface-coloured gap between segments, measured along the ring. */
const GAP = 2;
const SWATCH_CLASSES = ["bg-series-1", "bg-series-2", "bg-series-3"] as const;

export function EntriesByType({ slices }: Props) {
  const [active, setActive] = useState<number | null>(null);

  if (slices.length > seriesColors.length) {
    throw new Error(`EntriesByType shows at most ${seriesColors.length} categories; fold the rest into "Other".`);
  }

  const total = slices.reduce((sum, slice) => sum + slice.entries, 0);
  const percent = (entries: number) => Math.round((entries / total) * 100);

  const arcs = slices.map((slice, index) => {
    const before = slices.slice(0, index).reduce((sum, previous) => sum + previous.entries, 0);
    const length = (slice.entries / total) * CIRCUMFERENCE;
    return { start: (before / total) * CIRCUMFERENCE, length: Math.max(length - GAP, 0) };
  });

  const focused = active === null ? null : slices[active];
  const highlight = (index: number) => ({
    onPointerEnter: () => setActive(index),
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive(index),
    onBlur: () => setActive(null),
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row xl:flex-col 2xl:flex-row">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden="true">
          {arcs.map((arc, index) => (
            <circle
              key={slices[index].label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={seriesColors[index]}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.start}
              className={`cursor-default transition-opacity duration-150 ${active !== null && active !== index ? "opacity-35" : ""}`}
              {...highlight(index)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center" role="status">
          <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">
            {focused ? focused.entries : total}
          </p>
          <p className="text-xs text-ink-muted">{focused ? `${focused.label} · ${percent(focused.entries)}%` : "entries today"}</p>
        </div>
      </div>

      <ul className="w-full space-y-1">
        {slices.map((slice, index) => (
          <li key={slice.label}>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-surface-muted ${
                active === index ? "bg-surface-muted" : ""
              }`}
              {...highlight(index)}
            >
              <span className={`size-3 shrink-0 rounded-[3px] ${SWATCH_CLASSES[index]}`} aria-hidden="true" />
              <span className="flex-1 text-ink">{slice.label}</span>
              <span className="font-semibold tabular-nums">{slice.entries}</span>
              <span className="w-10 text-right tabular-nums text-ink-muted">{percent(slice.entries)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
