"use client";

import { useState } from "react";

type Bucket = {
  hour: string;
  entries: number;
};

type Props = {
  buckets: readonly Bucket[];
  /** The last bucket is the hour in progress. */
  lastIsPartial?: boolean;
};

const TICK_COUNT = 4;
const NICE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

function tickStep(max: number): number {
  return NICE_STEPS.find((step) => step * TICK_COUNT >= max) ?? Math.ceil(max / TICK_COUNT);
}

function nextHour(hour: string): string {
  return `${String(Number(hour.slice(0, 2)) + 1).padStart(2, "0")}:00`;
}

export function EntriesByHour({ buckets, lastIsPartial = false }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const step = tickStep(Math.max(...buckets.map((bucket) => bucket.entries)));
  const top = step * TICK_COUNT;
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => index * step);
  const peak = buckets.reduce((best, bucket, index) => (bucket.entries > buckets[best].entries ? index : best), 0);
  const heightOf = (entries: number) => `${(entries / top) * 100}%`;
  const isPartial = (index: number) => lastIsPartial && index === buckets.length - 1;

  return (
    <figure>
      <div className="flex">
        <div className="relative h-56 w-10 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-3 translate-y-1/2 text-xs tabular-nums text-ink-subtle"
              style={{ bottom: heightOf(tick) }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="relative h-56 flex-1">
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${tick === 0 ? "border-ink-subtle/50" : "border-border"}`}
              style={{ bottom: heightOf(tick) }}
            />
          ))}

          <div className="absolute inset-0 flex">
            {buckets.map((bucket, index) => (
              <button
                key={bucket.hour}
                type="button"
                aria-label={`${bucket.hour} to ${nextHour(bucket.hour)}: ${bucket.entries} entries${isPartial(index) ? " so far" : ""}`}
                className="relative flex h-full flex-1 items-end justify-center rounded-[6px] outline-none focus-visible:bg-surface-muted/70"
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              >
                {index === peak && active !== peak ? (
                  <span
                    className="absolute text-xs font-semibold tabular-nums text-ink"
                    style={{ bottom: `calc(${heightOf(bucket.entries)} + 6px)` }}
                  >
                    {bucket.entries}
                  </span>
                ) : null}
                <span
                  className={`w-full max-w-6 rounded-t-[4px] bg-series-1 transition-opacity duration-150 ${
                    active !== null && active !== index ? "opacity-40" : ""
                  }`}
                  style={{ height: heightOf(bucket.entries) }}
                />
              </button>
            ))}
          </div>

          {active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-3 py-2 text-ink-inverse shadow-floating"
              style={{
                left: `${((active + 0.5) / buckets.length) * 100}%`,
                bottom: `calc(${heightOf(buckets[active].entries)} + 12px)`,
              }}
            >
              <p className="text-sm font-semibold tabular-nums">{buckets[active].entries} entries</p>
              <p className="text-xs text-ink-inverse/75">
                {buckets[active].hour}–{nextHour(buckets[active].hour)}
                {isPartial(active) ? " · so far" : ""}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-10 mt-2 flex" aria-hidden="true">
        {buckets.map((bucket) => (
          <span key={bucket.hour} className="flex-1 text-center text-xs tabular-nums text-ink-subtle">
            {bucket.hour}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Entries by hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">Entries</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, index) => (
            <tr key={bucket.hour}>
              <th scope="row">{`${bucket.hour}–${nextHour(bucket.hour)}${isPartial(index) ? " (so far)" : ""}`}</th>
              <td>{bucket.entries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
