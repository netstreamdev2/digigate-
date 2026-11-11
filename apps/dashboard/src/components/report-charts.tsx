"use client";

import { compactCount, countLabel, type ReportBucket } from "@digigate/core";
import { useState } from "react";

const TICKS = 4;
const STEP_FACTORS = [0.25, 0.5, 1, 1.25, 1.5, 2, 2.5, 5, 10];
const MOST_AXIS_LABELS = 12;

function niceStep(peak: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, peak)));
  const step = STEP_FACTORS.map((factor) => factor * power).find((candidate) => candidate * TICKS >= peak) ?? power;
  return Math.max(1, Math.ceil(step));
}

type ColumnProps = {
  buckets: readonly ReportBucket[];
  /** What is being counted, for the tooltip and the table: "scans". */
  unit: string;
  caption: string;
};

/** One series over time, with a tooltip on every column and a table for screen readers. */
export function ColumnChart({ buckets, unit, caption }: ColumnProps) {
  const [active, setActive] = useState<number | null>(null);
  const values = buckets.map(({ value }) => value);
  const step = niceStep(Math.max(0, ...values));
  const top = step * TICKS;
  const ticks = Array.from({ length: TICKS + 1 }, (_unused, index) => index * step);
  const peak = values.indexOf(Math.max(...values));
  const heightOf = (value: number) => `${(value / top) * 100}%`;
  const everyNth = Math.max(1, Math.ceil(buckets.length / MOST_AXIS_LABELS));
  const shown = active === null ? null : buckets[active];

  return (
    <figure>
      <div className="flex">
        <div className="relative h-52 w-12 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-3 translate-y-1/2 whitespace-nowrap text-xs tabular-nums text-ink-subtle" style={{ bottom: heightOf(tick) }}>
              {compactCount(tick)}
            </span>
          ))}
        </div>

        <div className="relative h-52 min-w-0 flex-1">
          {ticks.map((tick) => (
            <div key={tick} aria-hidden="true" className={`absolute inset-x-0 border-t ${tick === 0 ? "border-ink-subtle/50" : "border-ink/10"}`} style={{ bottom: heightOf(tick) }} />
          ))}

          <div className="absolute inset-0 flex gap-[2px]">
            {buckets.map((bucket, index) => (
              <button
                key={`${bucket.label}-${bucket.detail}`}
                type="button"
                aria-label={`${bucket.detail}: ${countLabel(bucket.value)} ${unit}`}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-[6px] outline-none focus-visible:bg-ink/5"
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              >
                {index === peak && bucket.value > 0 && active === null ? (
                  <span className="absolute whitespace-nowrap text-xs font-semibold tabular-nums text-ink" style={{ bottom: `calc(${heightOf(bucket.value)} + 6px)` }}>
                    {compactCount(bucket.value)}
                  </span>
                ) : null}
                <span
                  className={`dg-grow-up w-full max-w-6 rounded-t-[4px] bg-series-1 transition-opacity duration-150 ${active !== null && active !== index ? "opacity-40" : ""}`}
                  style={{ height: bucket.value > 0 ? `max(2px, ${heightOf(bucket.value)})` : 0, animationDelay: `${index * 12}ms` }}
                />
              </button>
            ))}
          </div>

          {shown && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-3 py-2 text-ink-inverse shadow-floating"
              style={{ left: `clamp(60px, ${((active + 0.5) / buckets.length) * 100}%, calc(100% - 60px))`, bottom: `calc(${heightOf(shown.value)} + 12px)` }}
            >
              <p className="text-sm font-semibold tabular-nums">{`${countLabel(shown.value)} ${unit}`}</p>
              <p className="text-xs text-ink-inverse/75">{shown.detail}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-12 mt-2 flex gap-[2px]" aria-hidden="true">
        {buckets.map((bucket, index) => (
          <span key={`${bucket.label}-${bucket.detail}`} className="min-w-0 flex-1 whitespace-nowrap text-center text-xs tabular-nums text-ink-subtle">
            {index % everyNth === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={`${bucket.label}-${bucket.detail}`}>
              <th scope="row">{bucket.detail}</th>
              <td>{bucket.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A day of mobile data in bytes: DigiGate's own, and everything else on the handheld when that's known. */
export type DataColumn = { label: string; detail: string; app: number; other: number | null };

const MEGABYTE = 1024 * 1024;

function megabytes(value: number): string {
  if (value >= 1024) return `${(value / 1024).toFixed(1).replace(/\.0$/, "")} GB`;
  return `${Math.round(value)} MB`;
}

/**
 * Mobile data by day, stacked: DigiGate's own at the base, everything else above it (hotspot, other apps), so a tall
 * day that isn't DigiGate stands out. A day with only DigiGate's count shows that alone.
 */
export function DataColumns({ days, caption }: { days: readonly DataColumn[]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = days.map(({ app, other }) => (app + (other ?? 0)) / MEGABYTE);
  const step = niceStep(Math.max(0, ...totals));
  const top = step * TICKS;
  const ticks = Array.from({ length: TICKS + 1 }, (_unused, index) => index * step);
  const heightOf = (value: number) => `${(value / top) * 100}%`;
  const everyNth = Math.max(1, Math.ceil(days.length / MOST_AXIS_LABELS));
  const shown = active === null ? null : days[active];
  const shownTotal = active === null ? 0 : (totals[active] ?? 0);
  const anyOther = days.some(({ other }) => other !== null && other > 0);

  return (
    <figure>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted" aria-hidden="true">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-series-1" />
          DigiGate
        </span>
        {anyOther ? (
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-series-2" />
            Everything else: hotspot and other apps
          </span>
        ) : null}
      </div>

      <div className="flex">
        <div className="relative h-52 w-14 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-3 translate-y-1/2 whitespace-nowrap text-xs tabular-nums text-ink-subtle" style={{ bottom: heightOf(tick) }}>
              {megabytes(tick)}
            </span>
          ))}
        </div>

        <div className="relative h-52 min-w-0 flex-1">
          {ticks.map((tick) => (
            <div key={tick} aria-hidden="true" className={`absolute inset-x-0 border-t ${tick === 0 ? "border-ink-subtle/50" : "border-ink/10"}`} style={{ bottom: heightOf(tick) }} />
          ))}

          <div className="absolute inset-0 flex gap-[2px]">
            {days.map((day, index) => {
              const app = day.app / MEGABYTE;
              const other = (day.other ?? 0) / MEGABYTE;
              const dimmed = active !== null && active !== index ? "opacity-40" : "";
              return (
                <button
                  key={day.detail}
                  type="button"
                  aria-label={`${day.detail}: ${megabytes(app + other)}`}
                  className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[2px] rounded-[6px] outline-none focus-visible:bg-ink/5"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  {other > 0 ? (
                    <span className={`w-full max-w-6 rounded-t-[4px] bg-series-2 transition-opacity duration-150 ${dimmed}`} style={{ height: `max(2px, ${heightOf(other)})` }} />
                  ) : null}
                  {app > 0 ? (
                    <span
                      className={`w-full max-w-6 bg-series-1 transition-opacity duration-150 ${other > 0 ? "" : "rounded-t-[4px]"} ${dimmed}`}
                      style={{ height: `max(2px, ${heightOf(app)})` }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {shown && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-3 py-2 text-ink-inverse shadow-floating"
              style={{ left: `clamp(80px, ${((active + 0.5) / days.length) * 100}%, calc(100% - 80px))`, bottom: `calc(${heightOf(shownTotal)} + 12px)` }}
            >
              <p className="text-sm font-semibold tabular-nums">{megabytes(shownTotal)}</p>
              <p className="text-xs tabular-nums text-ink-inverse/75">
                {shown.other === null ? "DigiGate only: the rest isn't known" : `DigiGate ${megabytes(shown.app / MEGABYTE)} · everything else ${megabytes(shown.other / MEGABYTE)}`}
              </p>
              <p className="text-xs text-ink-inverse/75">{shown.detail}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-14 mt-2 flex gap-[2px]" aria-hidden="true">
        {days.map((day, index) => (
          <span key={day.detail} className="min-w-0 flex-1 whitespace-nowrap text-center text-xs tabular-nums text-ink-subtle">
            {index % everyNth === 0 ? day.label : ""}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">DigiGate</th>
            <th scope="col">Everything else</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.detail}>
              <th scope="row">{day.detail}</th>
              <td>{megabytes(day.app / MEGABYTE)}</td>
              <td>{day.other === null ? "Not known" : megabytes(day.other / MEGABYTE)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const LINES_AT_FIRST = 6;

/** Things ranked against each other: one colour, the longest bar is the most. The top few show, and the rest on request. */
export function RankBars({ lines, empty }: { lines: readonly { label: string; value: number }[]; empty: string }) {
  const [everything, setEverything] = useState(false);
  if (lines.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">{empty}</p>;
  const peak = Math.max(...lines.map(({ value }) => value));
  const shown = everything ? lines : lines.slice(0, LINES_AT_FIRST);
  return (
    <>
    <ul className="flex flex-col gap-3.5">
      {shown.map((line, index) => (
        <li key={line.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{line.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{countLabel(line.value)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-ink/5">
            <div className="dg-grow-across h-full rounded-pill bg-series-1" style={{ width: `${(line.value / peak) * 100}%`, animationDelay: `${index * 40}ms` }} />
          </div>
        </li>
      ))}
    </ul>
    {lines.length > LINES_AT_FIRST ? (
      <button type="button" onClick={() => setEverything(!everything)} className="mt-4 text-sm font-semibold text-brand transition-colors hover:text-ink">
        {everything ? "Show fewer" : `Show all ${lines.length}`}
      </button>
    ) : null}
    </>
  );
}

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 36;
const SPARK_PADDING = 4;

/** A week at a glance, ending on today's dot. */
export function Sparkline({ points, label }: { points: readonly number[]; label: string }) {
  const peak = Math.max(1, ...points);
  const stepX = (SPARK_WIDTH - SPARK_PADDING * 2) / Math.max(1, points.length - 1);
  const coordinates = points.map((value, index) => ({
    x: SPARK_PADDING + index * stepX,
    y: SPARK_HEIGHT - SPARK_PADDING - (value / peak) * (SPARK_HEIGHT - SPARK_PADDING * 2),
  }));
  const line = coordinates.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = coordinates[coordinates.length - 1];
  const first = coordinates[0];
  if (!last || !first) return null;

  return (
    <svg viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} role="img" aria-label={label} className="h-9 w-[120px] shrink-0">
      <path d={`${line} L${last.x} ${SPARK_HEIGHT} L${first.x} ${SPARK_HEIGHT} Z`} fill="var(--color-series-1)" opacity="0.1" />
      <path d={line} fill="none" stroke="var(--color-series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="4" fill="var(--color-series-1)" stroke="white" strokeWidth="2" />
    </svg>
  );
}
