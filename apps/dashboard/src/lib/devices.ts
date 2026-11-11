import "server-only";

import { likePattern, PAGE_SIZE, rangeOf } from "./paging";
import { must } from "./reads";
import { supabaseServer } from "./supabase/server";

/** `quiet` is a device that stopped answering with a guard on duty. With nobody on it, it's only `offline`. */
export type DeviceStatus = "quiet" | "offline" | "online" | "revoked";

export type SimState = "absent" | "ready" | "locked" | "faulty" | "unknown";

export type DeviceHealth = {
  battery: number | null;
  charging: boolean;
  network: string | null;
  wifiName: string | null;
  cellGeneration: string | null;
  cellBars: number | null;
  appVersion: string | null;
  locationAllowed: boolean | null;
  /** Null for a client's view-only login. */
  latitude: number | null;
  longitude: number | null;
  /** Whether DigiGate owns the handheld and holds it to the gate policy; null from builds before it could say. */
  managed: boolean | null;
  /** Steps of the gate policy Android refused. */
  policyProblems: string[];
  simState: SimState | null;
  simOperator: string | null;
  roaming: boolean | null;
  dataEnabled: boolean | null;
};

/** Mobile data this bundle period. `whole` is false when only DigiGate's own use is known, not the whole handheld's. */
export type DataUse = { bundleMb: number | null; usedBytes: number; whole: boolean };

export type FleetDevice = {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt: string | null;
  company: string;
  client: string;
  siteId: string;
  site: string;
  post: string | null;
  guard: string | null;
  status: DeviceStatus;
  lastCheckAt: string | null;
  checksToday: number;
  health: DeviceHealth | null;
  /** Null for a client's view-only login, and before the handheld has reported any or a bundle is set. */
  data: DataUse | null;
};

type Filter = { search: string; company: string };

const STATUSES: readonly DeviceStatus[] = ["quiet", "offline", "online", "revoked"];
const SIM_STATES: readonly SimState[] = ["absent", "ready", "locked", "faulty", "unknown"];

export const asDeviceStatus = (value: string): DeviceStatus | null => STATUSES.find((status) => status === value) ?? null;

const pattern = (search: string) => (search ? likePattern(search) : "");

function healthFrom(report: unknown): DeviceHealth | null {
  if (typeof report !== "object" || report === null) return null;
  const read = report as Record<string, unknown>;
  const number = (key: string) => (typeof read[key] === "number" ? read[key] : null);
  const words = (key: string) => (typeof read[key] === "string" ? read[key] : null);
  const yesNo = (key: string) => (typeof read[key] === "boolean" ? read[key] : null);
  const problems = read.policyProblems;
  return {
    battery: number("battery"),
    charging: read.charging === true,
    network: words("network"),
    wifiName: words("wifiName"),
    cellGeneration: words("cellGeneration"),
    cellBars: number("cellBars"),
    appVersion: words("appVersion"),
    locationAllowed: yesNo("locationAllowed"),
    latitude: number("latitude"),
    longitude: number("longitude"),
    managed: yesNo("managed"),
    policyProblems: Array.isArray(problems) ? problems.filter((problem): problem is string => typeof problem === "string") : [],
    simState: SIM_STATES.find((state) => state === read.simState) ?? null,
    simOperator: words("simOperator"),
    roaming: yesNo("roaming"),
    dataEnabled: yesNo("dataEnabled"),
  };
}

function dataFrom(bundleMb: number | null, usedBytes: number | null, whole: boolean | null): DataUse | null {
  if (usedBytes === null && bundleMb === null) return null;
  return { bundleMb, usedBytes: usedBytes ?? 0, whole: whole ?? false };
}

/** One page of the fleet, trouble first. The database decides whose devices come back. */
export async function deviceBoard({ search, company }: Filter, status: DeviceStatus | null, page: number): Promise<{ devices: FleetDevice[]; total: number }> {
  const supabase = await supabaseServer();
  const [from] = rangeOf(page);
  const rows = must(
    await supabase.rpc("device_board", { _search: pattern(search), _status: status ?? "", _limit: PAGE_SIZE, _offset: from, ...(company ? { _org: company } : {}) }),
  );
  return {
    total: rows[0]?.total ?? 0,
    devices: rows.flatMap((row) => {
      const known = asDeviceStatus(row.status);
      if (!known) return [];
      const device: FleetDevice = {
        id: row.id,
        name: row.name,
        pairedAt: row.paired_at,
        lastSeenAt: row.last_seen_at,
        company: row.org_name,
        client: row.client_name,
        siteId: row.site_id,
        site: row.site_name,
        post: row.post,
        guard: row.guard,
        status: known,
        lastCheckAt: row.last_check_at,
        checksToday: row.checks_today,
        health: healthFrom(row.health),
        data: dataFrom(row.data_bundle_mb, row.data_used_bytes, row.data_whole),
      };
      return [device];
    }),
  };
}

/** How many devices are in each state. Follows the search and company, not the state being viewed. */
export async function deviceSummary({ search, company }: Filter): Promise<Record<DeviceStatus, number>> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.rpc("device_summary", { _search: pattern(search), ...(company ? { _org: company } : {}) }));
  const summary: Record<DeviceStatus, number> = { quiet: 0, offline: 0, online: 0, revoked: 0 };
  for (const row of rows) {
    const known = asDeviceStatus(row.status);
    if (known) summary[known] = row.devices;
  }
  return summary;
}

export type DevicePage = {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt: string | null;
  company: string;
  client: string;
  siteId: string;
  site: string;
  post: string | null;
  guard: string | null;
  status: DeviceStatus;
  health: DeviceHealth | null;
  healthAt: string | null;
  /** Null for a client's view-only login, or until an admin sets them. */
  simNumber: string | null;
  bundleMb: number | null;
  renewsDay: number | null;
  /** The day the current bundle period started, as YYYY-MM-DD. */
  periodStart: string;
  canManage: boolean;
};

/** One handheld, or null when the viewer can't see it. */
export async function devicePage(id: string): Promise<DevicePage | null> {
  const supabase = await supabaseServer();
  const row = must(await supabase.rpc("device_detail", { _device: id }))[0];
  const status = row ? asDeviceStatus(row.status) : null;
  if (!row || !status) return null;
  return {
    id: row.id,
    name: row.name,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    company: row.org_name,
    client: row.client_name,
    siteId: row.site_id,
    site: row.site_name,
    post: row.post,
    guard: row.guard,
    status,
    health: healthFrom(row.health),
    healthAt: row.health_at,
    simNumber: row.sim_number,
    bundleMb: row.data_bundle_mb,
    renewsDay: row.data_renews_day,
    periodStart: row.data_period_start,
    canManage: row.can_manage,
  };
}

/** A day of mobile data, YYYY-MM-DD: the whole handheld's when known, and DigiGate's own. */
export type DataDay = { day: string; deviceBytes: number | null; appBytes: number | null };

export async function deviceData(id: string, days: number): Promise<DataDay[]> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.rpc("device_data", { _device: id, _days: days }));
  return rows.map((row) => ({ day: row.day, deviceBytes: row.device_bytes, appBytes: row.app_bytes }));
}

/** What the handheld reported about itself, newest first. */
export type StoryEntry = { at: string; kind: string; battery: number | null; reason: string | null; actor: string | null };

export async function deviceStory(id: string, limit: number): Promise<StoryEntry[]> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.rpc("device_story", { _device: id, _limit: limit }));
  return rows.map((row) => ({ at: row.at, kind: row.kind, battery: row.battery, reason: row.reason, actor: row.actor }));
}
