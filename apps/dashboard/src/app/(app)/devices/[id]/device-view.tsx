import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/card";
import { FormDialog } from "@/components/form-dialog";
import { Field, SelectField } from "@/components/form";
import { Icon, type IconName } from "@/components/icon";
import { DataColumns, type DataColumn } from "@/components/report-charts";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { storyLines, type StoryTone } from "@/lib/device-story";
import type { DataDay, DeviceHealth, DevicePage, StoryEntry } from "@/lib/devices";
import { addDays, ago, dataSize, MB, shortDate, siteToday, timeOfDay } from "@/lib/format";

import { saveDevicePlan } from "../actions";

const CHART_DAYS = 30;
const LOW_BATTERY = 20;
/** Below this share of the bundle left, the tile turns amber. */
const LOW_DATA = 0.2;
const NO_VALUE = "—";

const TONE_ICON: Record<StoryTone, { icon: IconName; className: string }> = {
  trouble: { icon: "result-warning", className: "text-warning" },
  back: { icon: "result-clear", className: "text-clear" },
  neutral: { icon: "info", className: "text-ink-subtle" },
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
    return { value: health.cellGeneration?.toUpperCase() ?? "Mobile", detail: health.cellBars === null ? (health.simOperator ?? "Mobile data") : `${health.cellBars} of 4 bars${health.simOperator ? ` · ${health.simOperator}` : ""}` };
  }
  return { value: health.network === "none" ? "None" : "Connected", detail: health.simState === "absent" ? "No SIM card in" : "No connection when it last reported" };
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
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-0 sm:flex-row sm:gap-4">
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

/** A handheld's page under its title: figures, data by day, what happened to it, and its SIM and bundle. */
export function DeviceView({ device, data, story, now }: { device: DevicePage; data: readonly DataDay[]; story: readonly StoryEntry[]; now: number }) {
  const health = device.health;
  const days = chartDays(data, siteToday(now));
  const inPeriod = data.filter((row) => row.day >= device.periodStart);
  const usedBytes = inPeriod.reduce((sum, row) => sum + (row.deviceBytes ?? row.appBytes ?? 0), 0);
  const onlyDigiGate = inPeriod.some((row) => row.deviceBytes === null);
  const bundleBytes = device.bundleMb === null ? null : device.bundleMb * MB;
  const leftBytes = bundleBytes === null ? null : Math.max(0, bundleBytes - usedBytes);
  const lowBattery = health?.battery !== null && health?.battery !== undefined && health.battery <= LOW_BATTERY && !health.charging;
  const link = connection(health);
  const lines = storyLines(story);

  return (
    <>
    <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Battery"
        value={health?.battery === null || health?.battery === undefined ? NO_VALUE : `${health.battery}%`}
        icon="device"
        detail={!health ? "No report yet" : health.charging ? "Charging" : lowBattery ? "Low, and not charging" : "Not charging"}
        meaning={lowBattery ? "warning" : "neutral"}
      />
      <StatTile label="Connection" value={link.value} icon="synced" detail={link.detail} />
      <StatTile
        label="Data used"
        value={dataSize(usedBytes)}
        icon="download"
        detail={`Since ${shortDate(`${device.periodStart}T12:00:00Z`)}${onlyDigiGate ? ", DigiGate's own only" : ""}`}
      />
      <StatTile
        label="Data left"
        value={leftBytes === null ? NO_VALUE : dataSize(leftBytes)}
        icon="upload"
        detail={bundleBytes === null ? "Set the bundle below to see this" : `Of a ${dataSize(bundleBytes)} bundle`}
        meaning={leftBytes === null || bundleBytes === null ? "neutral" : leftBytes === 0 ? "problem" : leftBytes < bundleBytes * LOW_DATA ? "warning" : "neutral"}
      />
    </section>

    <Card className="mt-6" title="Mobile data, last 30 days" subtitle="By the handheld's own day. Wi-Fi isn't counted.">
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">Nothing reported yet. Handhelds on the build of 12 November or later send it with every sync.</p>
      ) : (
        <DataColumns days={days} caption={`Mobile data by day on ${device.name}`} />
      )}
    </Card>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="What happened" subtitle="Written down on the handheld as it happened, and sent when it was back.">
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">Nothing yet. It notes when it&apos;s switched off, loses signal, or its SIM or mobile data changes.</p>
        ) : (
          <ol className="flex flex-col">
            {lines.map((line) => {
              const tone = TONE_ICON[line.tone];
              return (
                <li key={`${line.at}-${line.title}`} className="flex gap-3 border-b border-border py-3 last:border-0">
                  <span className={`mt-0.5 shrink-0 ${tone.className}`}>
                    <Icon name={tone.icon} className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{line.title}</p>
                    {line.detail ? <p className="text-sm text-ink-muted">{line.detail}</p> : null}
                  </div>
                  <time dateTime={line.at} className="shrink-0 text-right text-xs tabular-nums text-ink-subtle">
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

      <div className="flex flex-col gap-6">
        <Card title="Handheld">
          <dl>
            <Row label="Locked to DigiGate">{lockWords(health)}</Row>
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

        <Card
          title="SIM and bundle"
          subtitle="What's left is the bundle less what the handheld counted since it renewed. Your network's own figure is the final word."
          action={
            device.canManage ? (
              <FormDialog compact label="Change" title={`SIM and bundle for ${device.name}`} icon="device" submitLabel="Save" pendingLabel="Saving…" action={saveDevicePlan} fields={{ id: device.id }}>
                <Field label="SIM number" name="simNumber" defaultValue={device.simNumber ?? ""} placeholder="082 123 4567" inputMode="tel" autoComplete="off" />
                <div className="flex gap-3">
                  <Field
                    label="Bundle size"
                    name="bundle"
                    className="flex-1"
                    defaultValue={device.bundleMb === null ? "" : device.bundleMb % 1024 === 0 ? String(device.bundleMb / 1024) : String(device.bundleMb)}
                    inputMode="decimal"
                    placeholder="2"
                  />
                  <SelectField label="In" name="unit" defaultValue={device.bundleMb !== null && device.bundleMb % 1024 !== 0 ? "MB" : "GB"}>
                    <option value="GB">GB</option>
                    <option value="MB">MB</option>
                  </SelectField>
                </div>
                <Field label="Renews on day of the month" name="renewsDay" defaultValue={device.renewsDay === null ? "" : String(device.renewsDay)} inputMode="numeric" placeholder="1" />
              </FormDialog>
            ) : null
          }
        >
          <dl>
            <Row label="SIM">{simWords(health)}</Row>
            <Row label="SIM number">{device.simNumber ?? "Not set"}</Row>
            <Row label="Bundle">{bundleBytes === null ? "Not set" : `${dataSize(bundleBytes)}, renews on day ${device.renewsDay ?? 1} of each month`}</Row>
            <Row label="This period">{`Since ${shortDate(`${device.periodStart}T12:00:00Z`)}: ${dataSize(usedBytes)} used${leftBytes === null ? "" : `, ${dataSize(leftBytes)} left`}`}</Row>
          </dl>
        </Card>
      </div>
    </div>
    </>
  );
}
