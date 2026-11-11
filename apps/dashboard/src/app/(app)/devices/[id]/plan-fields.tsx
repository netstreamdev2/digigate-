"use client";

import { useState, type CSSProperties } from "react";

import { Field } from "@/components/form";
import { dataSize, MB } from "@/lib/format";

/** The bundle sizes South African networks sell, in MB; the first stop is none. */
const BUNDLES = [0, 250, 500, 1024, 2048, 3072, 5120, 10240, 20480, 51200] as const;

const ordinal = (day: number) => {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
};

const fill = (index: number, last: number) => ({ "--dg-slider-fill": `${(index / last) * 100}%` }) as CSSProperties;

/** The nearest stop to a bundle already set, so the slider opens where it was. */
function stopOf(bundleMb: number | null): number {
  if (!bundleMb) return 0;
  let best = 1;
  BUNDLES.forEach((size, index) => {
    if (index > 0 && Math.abs(size - bundleMb) < Math.abs((BUNDLES[best] ?? 0) - bundleMb)) best = index;
  });
  return best;
}

/** The SIM's number, and its bundle and renewal day on two sliders, sent as the plain fields the action reads. */
export function PlanFields({ simNumber, bundleMb, renewsDay }: { simNumber: string | null; bundleMb: number | null; renewsDay: number | null }) {
  const [stop, setStop] = useState(() => stopOf(bundleMb));
  const [day, setDay] = useState(renewsDay ?? 1);
  const size = BUNDLES[stop] ?? 0;
  const last = BUNDLES.length - 1;

  return (
    <>
      <Field label="SIM number" name="simNumber" defaultValue={simNumber ?? ""} placeholder="082 123 4567" inputMode="tel" autoComplete="off" />

      <div className="flex flex-col gap-3 rounded-lg bg-tile-sky/60 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="bundle-slider" className="text-sm font-medium">
            Bundle each month
          </label>
          <span className="font-display text-2xl font-semibold tabular-nums text-brand">{size ? dataSize(size * MB) : "None"}</span>
        </div>
        <input
          id="bundle-slider"
          type="range"
          min={0}
          max={last}
          step={1}
          value={stop}
          onChange={(event) => setStop(Number(event.target.value))}
          className="dg-slider"
          style={fill(stop, last)}
          aria-valuetext={size ? dataSize(size * MB) : "No bundle"}
        />
        <div className="flex justify-between text-xs text-ink-subtle" aria-hidden="true">
          <span>None</span>
          <span>1 GB</span>
          <span>5 GB</span>
          <span>50 GB</span>
        </div>
        <input type="hidden" name="bundle" value={size ? String(size) : ""} />
        <input type="hidden" name="unit" value="MB" />
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-tile-lilac/60 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="renew-slider" className="text-sm font-medium">
            Renews on the
          </label>
          <span className="font-display text-2xl font-semibold tabular-nums text-brand">{ordinal(day)}</span>
        </div>
        <input
          id="renew-slider"
          type="range"
          min={1}
          max={31}
          step={1}
          value={day}
          onChange={(event) => setDay(Number(event.target.value))}
          className="dg-slider"
          style={fill(day - 1, 30)}
          aria-valuetext={`The ${ordinal(day)} of each month`}
        />
        <div className="flex justify-between text-xs text-ink-subtle" aria-hidden="true">
          <span>1st</span>
          <span>15th</span>
          <span>31st</span>
        </div>
        <input type="hidden" name="renewsDay" value={String(day)} />
      </div>
    </>
  );
}
