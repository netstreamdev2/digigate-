import Link from "next/link";
import type { CSSProperties } from "react";

import { BatteryGauge, DataRing, LiveDot, SignalBars, type Tone } from "@/components/device-signs";
import { Icon } from "@/components/icon";
import { attentionOf } from "@/lib/device-attention";
import type { FleetDevice } from "@/lib/devices";
import { ago, dataSize, MB, plural } from "@/lib/format";

/** The card's tint and status words, the way the gate app colours its tiles. */
const LOOK: Record<FleetDevice["status"], { tint: string; tone: Tone; words: string }> = {
  online: { tint: "from-tile-mint", tone: "clear", words: "Online" },
  quiet: { tint: "from-blocked-soft", tone: "blocked", words: "Not responding" },
  offline: { tint: "from-tile-butter", tone: "neutral", words: "Offline" },
  revoked: { tint: "from-surface-muted", tone: "neutral", words: "Revoked" },
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

function networkWords(device: FleetDevice): string {
  const health = device.health;
  if (!health) return "No report";
  if (health.network === "wifi") return "Wi-Fi";
  if (health.network === "cellular") return health.cellGeneration?.toUpperCase() ?? "Mobile";
  return health.network === "none" ? "No connection" : "Connected";
}

/** One handheld as a card: its status, its battery, signal and data at a glance, what needs attention, and who's on it. */
export function DeviceCard({ device, now, index, narrow = false }: { device: FleetDevice; now: number; index: number; narrow?: boolean }) {
  const look = LOOK[device.status];
  const health = device.health;
  const attention = attentionOf(device);
  const red = attention.some(({ tone }) => tone === "blocked");
  const bundleBytes = device.data?.bundleMb ? device.data.bundleMb * MB : null;
  const words = device.status === "offline" && !device.lastSeenAt ? "Never connected" : look.words;

  return (
    <Link
      href={`/devices/${device.id}`}
      style={{ "--dg-i": index } as CSSProperties}
      className={`dg-glass dg-company-card group flex shrink-0 flex-col overflow-hidden ${narrow ? "w-[19rem]" : "w-full"} ${red ? "dg-trouble" : ""}`}
    >
      <div className={`bg-linear-to-b ${look.tint} to-transparent px-5 pb-3 pt-4`}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold text-ink">
            <LiveDot tone={look.tone} live={device.status === "online" || device.status === "quiet"} />
            {words}
            <span className="font-normal text-ink-muted">{device.lastSeenAt ? `· ${ago(device.lastSeenAt, now)}` : ""}</span>
          </span>
          {health?.managed === true ? (
            <span title="Locked to DigiGate: home screen, no hotspot, other apps hidden" className="grid size-7 place-items-center rounded-pill bg-surface/80 text-brand">
              <Icon name="lock" className="size-4" />
            </span>
          ) : health?.managed === false ? (
            <span title="Not locked to DigiGate" className="grid size-7 place-items-center rounded-pill bg-warning-soft text-warning">
              <Icon name="unlock" className="size-4" />
            </span>
          ) : null}
        </div>
        <p className="mt-3 truncate font-display text-lg font-semibold tracking-tight text-ink" title={device.name}>
          {device.name}
        </p>
        <p className="truncate text-sm text-ink-muted" title={`${device.site} · ${device.company}`}>
          {`${device.site} · ${device.company}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 py-3">
        <div className="flex items-center gap-2">
          <BatteryGauge level={health?.battery ?? null} charging={health?.charging ?? false} />
          <span className="min-w-0 text-xs leading-tight">
            <span className="block font-semibold tabular-nums text-ink">{health?.battery === null || health?.battery === undefined ? "—" : `${health.battery}%`}</span>
            <span className="block text-ink-muted">{health?.charging ? "Charging" : "Battery"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SignalBars bars={health?.network === "wifi" ? 4 : (health?.cellBars ?? null)} />
          <span className="min-w-0 text-xs leading-tight">
            <span className="block truncate font-semibold text-ink">{networkWords(device)}</span>
            <span className="block truncate text-ink-muted">{health?.simState === "absent" ? "No SIM" : (health?.simOperator ?? "Signal")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {device.data ? <DataRing usedBytes={device.data.usedBytes} bundleBytes={bundleBytes} /> : <span className="grid size-16 place-items-center text-xs text-ink-subtle">—</span>}
          <span className="sr-only">{device.data ? `${dataSize(device.data.usedBytes)} used` : "No data yet"}</span>
        </div>
      </div>

      {attention.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 px-5 pb-3">
          {attention.map((item) => (
            <li key={item.label} className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ${item.tone === "blocked" ? "bg-blocked-soft text-blocked" : "bg-warning-soft text-warning"}`}>
              <Icon name={item.tone === "blocked" ? "result-blocked" : "result-warning"} className="size-3.5" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center gap-3 border-t border-ink/5 px-5 py-3">
        {device.guard ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-tile-lilac font-display text-sm font-semibold text-brand">{initialsOf(device.guard)}</span>
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-surface-muted text-ink-subtle">
            <Icon name="guard" className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm leading-tight">
          <span className="block truncate font-medium text-ink">{device.guard ?? (device.status === "revoked" ? "Revoked" : "Nobody on duty")}</span>
          <span className="block truncate text-xs text-ink-muted">
            {[device.post, device.checksToday ? `${plural(device.checksToday, "scan")} today` : "No scans today"].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Icon name="chevron-right" className="dg-card-arrow size-5 text-ink-subtle" />
      </div>
    </Link>
  );
}
