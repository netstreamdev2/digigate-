import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Card } from "@/components/card";
import { CountUp } from "@/components/count-up";
import { BatteryGauge, DataRing, LiveDot, LOW_BATTERY, SignalBars, type Tone } from "@/components/device-signs";
import { FormDialog } from "@/components/form-dialog";
import { Icon, type IconName } from "@/components/icon";
import type { DataColumn } from "@/components/report-charts";
import { StatusChip } from "@/components/status-chip";
import { TintTile, type Tint } from "@/components/tint-tile";
import { attentionOf } from "@/lib/device-attention";
import { storyLines, type StoryTone } from "@/lib/device-story";
import type { DataDay, DeviceHealth, DevicePage, StoryEntry } from "@/lib/devices";
import { addDays, ago, dataSize, MB, shortDate, siteToday, timeOfDay } from "@/lib/format";

import { saveDevicePlan } from "../actions";
import { DataPanel } from "./data-panel";
import { PlanFields } from "./plan-fields";

const CHART_DAYS = 30;
const NO_VALUE = "—";

const NODE: Record<StoryTone, { icon: IconName; ring: string }> = {
  trouble: { icon: "result-warning", ring: "bg-warning-soft text-warning" },
  back: { icon: "result-clear", ring: "bg-clear-soft text-clear" },
  neutral: { icon: "info", ring: "bg-surface-muted text-ink-subtle" },
};

const STATUS: Record<DevicePage["status"], { tint: Tint; tone: Tone; words: string }> = {
  online: { tint: "mint", tone: "clear", words: "Online" },
  quiet: { tint: "blocked", tone: "blocked", words: "Not responding" },
  offline: { tint: "butter", tone: "neutral", words: "Offline" },
  revoked: { tint: "lilac", tone: "neutral", words: "Revoked" },
};

export function StatusOf({ device }: { device: DevicePage }) {
  switch (device.status) {
    case "online":
      return <StatusChip status="clear" label="Online" />;
    case "quiet":
      return <StatusChip status="warning" label="Not responding" />;
    case "revoked":
      return <StatusChip status="blocked" label="Revoked" />;
    case "offline":
      return <StatusChip status="info" label={device.lastSeenAt ? "Offline" : "Never connected"} />;
  }
}

function connection(health: DeviceHealth | null): { value: string; detail: string } {
  if (!health) return { value: NO_VALUE, detail: "No report yet" };
  if (health.network === "wifi") return { value: "Wi-Fi", detail: health.wifiName ?? "Network name hidden" };
  if (health.network === "cellular") {
    return { value: health.cellGeneration?.toUpperCase() ?? "Mobile", detail: [health.cellBars === null ? null : `${health.cellBars} of 4 bars`, health.simOperator].filter(Boolean).join(" · ") || "Mobile data" };
  }
  return { value: health.network === "none" ? "None" : "Connected", detail: health.simState === "absent" ? "No SIM card in" : "No connection at its last report" };
}

function simWords(health: DeviceHealth | null): string {
  if (!health?.simState) return NO_VALUE;
  if (health.simState === "absent") return "No SIM card in";
  if (health.simState === "locked") return "SIM locked: it needs its PIN";
  if (health.simState === "faulty") return "SIM not working";
  return [health.simOperator ?? "SIM in", health.dataEnabled === false ? "mobile data off" : health.dataEnabled ? "mobile data on" : null, health.roaming ? "roaming" : null]
    .filter(Boolean)
    .join(" · ");
}

function lockWords(health: DeviceHealth | null): string {
  if (health?.managed === true) {
    return health.policyProblems.length === 0
      ? "Yes: DigiGate is its home screen, other apps are hidden, hotspot is off"
      : `Yes, but Android refused ${health.policyProblems.length === 1 ? "one setting" : `${health.policyProblems.length} settings`}: ${health.policyProblems.join(", ")}`;
  }
  return health?.managed === false ? "No: set up without DigiGate as its owner, so hotspot and other apps are open" : NO_VALUE;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-ink/5 py-3 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-36 shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function chartDays(rows: readonly DataDay[], today: string): DataColumn[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: CHART_DAYS }, (_unused, index) => {
    const day = addDays(today, index - CHART_DAYS + 1);
    const row = byDay.get(day);
    const app = row?.appBytes ?? 0;
    const other = row?.deviceBytes === null || row?.deviceBytes === undefined ? null : Math.max(0, row.deviceBytes - app);
    return { label: shortDate(`${day}T12:00:00Z`), detail: day, app, other: row ? other : 0 };
  });
}

/** A handheld's page under its title: its signs as the app's tiles, its data by day, what happened to it, and its SIM. */
/** `full` is for DigiGate staff. A company's own people see battery, network, location and whereabouts only. */
export function DeviceView({ device, data, story, now, full }: { device: DevicePage; data: readonly DataDay[]; story: readonly StoryEntry[]; now: number; full: boolean }) {
  const health = device.health;
  const inPeriod = data.filter((row) => row.day >= device.periodStart);
  const usedBytes = inPeriod.reduce((sum, row) => sum + (row.deviceBytes ?? row.appBytes ?? 0), 0);
  const onlyDigiGate = inPeriod.some((row) => row.deviceBytes === null);
  const bundleBytes = device.bundleMb === null ? null : device.bundleMb * MB;
  const leftBytes = bundleBytes === null ? null : Math.max(0, bundleBytes - usedBytes);
  const lowBattery = health?.battery !== null && health?.battery !== undefined && health.battery <= LOW_BATTERY && !health.charging;
  const link = connection(health);
  const lines = storyLines(story);
  const status = STATUS[device.status];
  const attention = attentionOf({ ...device, data: { bundleMb: device.bundleMb, usedBytes } });
  const since = shortDate(`${device.periodStart}T12:00:00Z`);

  return (
    <>
      {attention.length > 0 ? (
        <ul aria-label="Needs attention" className="mt-6 flex flex-wrap gap-2">
          {attention.map((item) => (
            <li
              key={item.label}
              className={`inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold ${item.tone === "blocked" ? "dg-trouble bg-blocked-soft text-blocked" : "bg-warning-soft text-warning"}`}
            >
              <Icon name={item.tone === "blocked" ? "result-blocked" : "result-warning"} className="size-4" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-label="Its signs" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-[28px] p-5 ${lowBattery ? "bg-warning-soft" : "bg-tile-mint"}`}>
          <div className="flex items-center gap-5">
            <BatteryGauge level={health?.battery ?? null} charging={health?.charging ?? false} large />
            <div>
              <p className="font-display text-4xl font-semibold tracking-tight text-ink">
                {health?.battery === null || health?.battery === undefined ? NO_VALUE : <CountUp value={health.battery} format="percent" />}
              </p>
              <p className="mt-1 font-semibold text-ink">Battery</p>
              <p className="text-sm text-ink-muted">{!health ? "No report yet" : health.charging ? "Charging" : lowBattery ? "Low, and not charging" : "Not charging"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-tile-sky p-5">
          <div className="flex items-center gap-5">
            <SignalBars bars={health?.network === "wifi" ? 4 : (health?.cellBars ?? null)} large />
            <div className="min-w-0">
              <p className="font-display text-4xl font-semibold tracking-tight text-ink">{link.value}</p>
              <p className="mt-1 font-semibold text-ink">Connection</p>
              <p className="truncate text-sm text-ink-muted">{link.detail}</p>
            </div>
          </div>
        </div>

        {full ? (
          <div className="rounded-[28px] bg-tile-lilac p-5 xl:row-span-1">
            <div className="flex items-center gap-4">
              <DataRing usedBytes={usedBytes} bundleBytes={bundleBytes} size="medium" />
              <div className="min-w-0">
                <p className="font-display text-4xl font-semibold tracking-tight text-ink">
                  <CountUp value={leftBytes ?? usedBytes} format="data" />
                </p>
                <p className="mt-1 font-semibold text-ink">{leftBytes === null ? "Data used" : "Data left"}</p>
                <p className="truncate text-sm text-ink-muted">
                  {leftBytes === null ? `Since ${since}${onlyDigiGate ? ", DigiGate's own" : ""}` : `${dataSize(usedBytes)} used of ${dataSize(bundleBytes ?? 0)} since ${since}`}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className={`rounded-[28px] p-5 ${health?.locationAllowed === false ? "bg-warning-soft" : "bg-tile-lilac"}`}>
            <div className="flex items-center gap-5">
              <span className="grid size-16 shrink-0 place-items-center rounded-pill bg-surface/85 text-brand">
                <Icon name="pin" className="size-8" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-4xl font-semibold tracking-tight text-ink">
                  {health?.locationAllowed === false ? "Off" : health?.latitude !== null && health?.latitude !== undefined ? "Shared" : NO_VALUE}
                </p>
                <p className="mt-1 font-semibold text-ink">Location</p>
                {health?.latitude !== null && health?.latitude !== undefined && health.longitude !== null && health?.locationAllowed !== false ? (
                  <a href={`https://www.google.com/maps?q=${health.latitude},${health.longitude}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand hover:text-ink">
                    Open the map
                  </a>
                ) : (
                  <p className="text-sm text-ink-muted">{health?.locationAllowed === false ? "Switched off or not allowed" : "Not reported yet"}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <TintTile
          tint={status.tint}
          flash={device.status === "quiet"}
          icon={health?.managed === true ? "lock" : health?.managed === false ? "unlock" : "device"}
          label={health?.managed === true ? "Locked to DigiGate" : health?.managed === false ? "Not locked to DigiGate" : "Handheld"}
          value={
            <span className="flex items-center gap-3 text-3xl">
              <LiveDot tone={status.tone} live={device.status === "online" || device.status === "quiet"} />
              {device.status === "offline" && !device.lastSeenAt ? "Never connected" : status.words}
            </span>
          }
          detail={device.lastSeenAt ? `Seen ${ago(device.lastSeenAt, now)}` : "Never seen"}
        />
      </section>

      {full ? (
        <Card className="mt-6" title="Mobile data" subtitle="By the handheld's own day: DigiGate at the base, everything else (hotspot and other apps) on top. Wi-Fi isn't counted.">
          {data.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">Nothing reported yet. Handhelds on the build of 11 November or later send it with every sync.</p>
          ) : (
            <DataPanel days={chartDays(data, siteToday(now))} caption={`Mobile data by day on ${device.name}`} />
          )}
        </Card>
      ) : null}

      <div className={`mt-6 grid gap-6 ${full ? "xl:grid-cols-2" : ""}`}>
        {full ? (
        <Card title="What happened" subtitle="Written down on the handheld as it happened, and sent when it was back.">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">Nothing yet. It notes when it&apos;s switched off, loses signal, or its SIM or mobile data changes.</p>
          ) : (
            <ol className="dg-ripple relative">
              <span aria-hidden="true" className="absolute bottom-4 left-[17px] top-4 w-0.5 rounded-pill bg-ink/10" />
              {lines.map((line, index) => {
                const node = NODE[line.tone];
                return (
                  <li key={`${line.at}-${line.title}`} style={{ "--dg-i": index } as CSSProperties} className="relative flex gap-4 py-3">
                    <span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-pill ring-4 ring-surface ${node.ring}`}>
                      <Icon name={node.icon} className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1 pt-1.5">
                      <p className="text-sm font-semibold text-ink">{line.title}</p>
                      {line.detail ? <p className="text-sm text-ink-muted">{line.detail}</p> : null}
                    </div>
                    <time dateTime={line.at} className="shrink-0 pt-1.5 text-right text-xs tabular-nums text-ink-subtle">
                      {shortDate(line.at)}
                      <br />
                      {timeOfDay(line.at)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
        ) : null}

        <div className="flex flex-col gap-6">
          {full ? (
          <Card
            title="SIM and bundle"
            subtitle="What's left is the bundle less what the handheld counted since it renewed. Your network's own figure is the final word."
            action={
              device.canManage ? (
                <FormDialog wide compact label="Change" title={`SIM and bundle for ${device.name}`} icon="device" submitLabel="Save" pendingLabel="Saving…" action={saveDevicePlan} fields={{ id: device.id }}>
                  <PlanFields simNumber={device.simNumber} bundleMb={device.bundleMb} renewsDay={device.renewsDay} />
                </FormDialog>
              ) : null
            }
          >
            <dl>
              <Row label="SIM">{simWords(health)}</Row>
              <Row label="SIM number">{device.simNumber ?? "Not set"}</Row>
              <Row label="Bundle">{bundleBytes === null ? "Not set" : `${dataSize(bundleBytes)}, renews on day ${device.renewsDay ?? 1} of each month`}</Row>
              <Row label="This period">{`Since ${since}: ${dataSize(usedBytes)} used${leftBytes === null ? "" : `, ${dataSize(leftBytes)} left`}`}</Row>
            </dl>
          </Card>
          ) : null}

          <Card title="Handheld">
            <dl>
              {full ? <Row label="Locked to DigiGate">{lockWords(health)}</Row> : null}
              <Row label="Where">
                <Link href={`/control-room/${device.siteId}`} className="transition-colors hover:text-brand">
                  {device.site}
                </Link>
                {device.post ? ` · ${device.post}` : ""}
              </Row>
              <Row label="On duty">{device.guard ?? "Nobody"}</Row>
              <Row label="Last seen">{device.lastSeenAt ? `${ago(device.lastSeenAt, now)} (${shortDate(device.lastSeenAt)}, ${timeOfDay(device.lastSeenAt)})` : "Never"}</Row>
              <Row label="App">{health?.appVersion ? `Version ${health.appVersion}` : NO_VALUE}</Row>
              <Row label="Location">
                {health?.locationAllowed === false ? (
                  <span className="text-warning">Switched off or not allowed</span>
                ) : health?.latitude !== null && health?.latitude !== undefined && health.longitude !== null ? (
                  <a href={`https://www.google.com/maps?q=${health.latitude},${health.longitude}`} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:text-ink">
                    Open the map
                  </a>
                ) : (
                  NO_VALUE
                )}
              </Row>
              <Row label="Paired">{shortDate(device.pairedAt)}</Row>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
