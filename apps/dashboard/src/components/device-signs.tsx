import type { CSSProperties } from "react";

import { dataSize } from "@/lib/format";

/*
 * A handheld's live signs, drawn the way the gate app draws its tiles: a dot that pings while it's live, a battery that
 * fills, signal bars that rise one by one, and a ring that sweeps round to what's left of the data bundle. Plain
 * markup and CSS (globals.css, "Devices"), so they render on the server and hold still for people who turn animation
 * off. Every sign has words beside it, so colour is never the only signal.
 */

export type Tone = "clear" | "warning" | "blocked" | "neutral";

const DOT: Record<Tone, string> = {
  clear: "text-clear",
  warning: "text-warning",
  blocked: "text-blocked",
  neutral: "text-ink-subtle",
};

/** A status dot; `live` makes it ping. */
export function LiveDot({ tone, live = false }: { tone: Tone; live?: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-flex size-2.5 shrink-0 ${DOT[tone]}`}>
      <span className={`size-2.5 rounded-full bg-current ${live ? "dg-ping" : ""}`} />
    </span>
  );
}

/** Below this, and not charging, a battery shows amber. */
export const LOW_BATTERY = 20;

export function BatteryGauge({ level, charging, large = false }: { level: number | null; charging: boolean; large?: boolean }) {
  const low = level !== null && level <= LOW_BATTERY && !charging;
  const fill = level === null ? "bg-ink/15" : low ? "bg-warning" : charging ? "bg-clear" : level > 50 ? "bg-clear" : "bg-brand";
  return (
    <span
      role="img"
      aria-label={level === null ? "Battery not reported" : `Battery ${level}%${charging ? ", charging" : low ? ", low" : ""}`}
      className={`relative inline-flex shrink-0 flex-col items-center ${large ? "h-24 w-12" : "h-11 w-6"}`}
    >
      <span className={`rounded-t-[3px] bg-ink/25 ${large ? "h-2 w-5" : "h-1 w-2.5"}`} />
      <span className={`relative flex w-full flex-1 overflow-hidden border-ink/25 bg-surface/70 ${large ? "rounded-[10px] border-[3px] p-[3px]" : "rounded-[5px] border-2 p-[2px]"}`}>
        <span className="relative flex h-full w-full items-end overflow-hidden rounded-[3px]">
          <span className={`dg-fill-up w-full rounded-[3px] ${fill} ${charging ? "dg-charging" : ""}`} style={{ height: `${Math.max(4, level ?? 0)}%` }} />
        </span>
      </span>
    </span>
  );
}

const BAR_HEIGHTS = [30, 52, 76, 100];

/** Four bars, filled to the strength reported; Wi-Fi shows as full bars of its own strength. */
export function SignalBars({ bars, large = false }: { bars: number | null; large?: boolean }) {
  const filled = bars ?? 0;
  return (
    <span
      role="img"
      aria-label={bars === null ? "Signal not reported" : `${bars} of 4 bars`}
      className={`dg-bars inline-flex shrink-0 items-end ${large ? "h-12 gap-1.5" : "h-6 gap-[3px]"}`}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          className={`rounded-[2px] ${large ? "w-2.5" : "w-1.5"} ${index < filled ? (filled <= 1 ? "bg-warning" : "bg-brand") : "bg-ink/15"}`}
          style={{ height: `${height}%`, "--dg-i": index } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** Below this share of the bundle left, the ring shows amber; none left is red. */
export const LOW_DATA = 0.2;

/**
 * What's left of the data bundle, as a ring that sweeps round to it. With no bundle set it shows what was used.
 */
export function DataRing({ usedBytes, bundleBytes, size: shape = "small" }: { usedBytes: number; bundleBytes: number | null; size?: "small" | "medium" | "large" }) {
  const large = shape === "large";
  const size = { small: 64, medium: 96, large: 168 }[shape];
  const stroke = { small: 7, medium: 10, large: 14 }[shape];
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const left = bundleBytes === null ? null : Math.max(0, bundleBytes - usedBytes);
  const share = bundleBytes === null || left === null ? 0 : left / bundleBytes;
  const colour = left === null ? "var(--color-ink-subtle)" : left === 0 ? "var(--color-blocked)" : share < LOW_DATA ? "var(--color-warning)" : "var(--color-brand)";
  const offset = circumference * (1 - share);
  return (
    <span role="img" aria-label={left === null ? `${dataSize(usedBytes)} used, no bundle set` : `${dataSize(left)} left of ${dataSize(bundleBytes ?? 0)}`} className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-muted)" strokeWidth={stroke} />
        {left !== null ? (
          <circle
            className="dg-sweep"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ "--dg-sweep-from": `${circumference}` } as CSSProperties}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {large ? (
          <>
            <span className="font-display text-2xl font-semibold tabular-nums text-ink">{left === null ? dataSize(usedBytes) : dataSize(left)}</span>
            <span className="text-xs text-ink-muted">{left === null ? "used, no bundle" : `left of ${dataSize(bundleBytes ?? 0)}`}</span>
          </>
        ) : (
          <>
            <span className={`font-semibold tabular-nums text-ink ${shape === "medium" ? "text-base" : "text-[11px]"}`}>{left === null ? "—" : `${Math.round(share * 100)}%`}</span>
            {left === null ? null : <span className={`text-ink-muted ${shape === "medium" ? "text-xs" : "text-[9px]"}`}>left</span>}
          </>
        )}
      </span>
    </span>
  );
}
