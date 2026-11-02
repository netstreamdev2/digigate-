import "server-only";

import { likePattern, PAGE_SIZE, rangeOf } from "./paging";
import { must } from "./reads";
import { supabaseServer } from "./supabase/server";

/** `quiet` is a device that stopped answering with a guard on duty. With nobody on it, it's only `offline`. */
export type DeviceStatus = "quiet" | "offline" | "online" | "revoked";

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
};

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
};

type Filter = { search: string; company: string };

const STATUSES: readonly DeviceStatus[] = ["quiet", "offline", "online", "revoked"];

export const asDeviceStatus = (value: string): DeviceStatus | null => STATUSES.find((status) => status === value) ?? null;

const pattern = (search: string) => (search ? likePattern(search) : "");

function healthFrom(report: unknown): DeviceHealth | null {
  if (typeof report !== "object" || report === null) return null;
  const read = report as Record<string, unknown>;
  const number = (key: string) => (typeof read[key] === "number" ? read[key] : null);
  const words = (key: string) => (typeof read[key] === "string" ? read[key] : null);
  return {
    battery: number("battery"),
    charging: read.charging === true,
    network: words("network"),
    wifiName: words("wifiName"),
    cellGeneration: words("cellGeneration"),
    cellBars: number("cellBars"),
    appVersion: words("appVersion"),
    locationAllowed: typeof read.locationAllowed === "boolean" ? read.locationAllowed : null,
    latitude: number("latitude"),
    longitude: number("longitude"),
  };
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
