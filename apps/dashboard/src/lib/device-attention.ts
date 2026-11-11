import { MB } from "./format";

/*
 * What about a handheld needs someone's attention, worst first, in plain words. Red ones flash on the Devices page.
 * Shared by the list and a device's own page, so both say the same thing about the same handheld.
 */

export type Attention = { label: string; tone: "blocked" | "warning" };

type Signs = {
  status: "quiet" | "offline" | "online" | "revoked";
  lastSeenAt: string | null;
  health: {
    battery: number | null;
    charging: boolean;
    managed: boolean | null;
    simState: string | null;
    dataEnabled: boolean | null;
  } | null;
  data: { bundleMb: number | null; usedBytes: number } | null;
};

const LOW_BATTERY = 20;
const FLAT_BATTERY = 10;
const LOW_DATA = 0.2;

export function attentionOf({ status, lastSeenAt, health, data }: Signs): Attention[] {
  if (status === "revoked") return [];
  const found: Attention[] = [];
  if (status === "quiet") found.push({ label: "Guard on duty, no answer", tone: "blocked" });
  if (status === "offline" && !lastSeenAt) found.push({ label: "Never connected", tone: "warning" });
  if (health) {
    if (health.dataEnabled === false) found.push({ label: "Mobile data switched off", tone: "blocked" });
    if (health.simState === "absent") found.push({ label: "No SIM card", tone: "warning" });
    if (health.battery !== null && health.battery <= LOW_BATTERY && !health.charging) {
      found.push({ label: `Battery ${health.battery}%`, tone: health.battery <= FLAT_BATTERY ? "blocked" : "warning" });
    }
    if (health.managed === false) found.push({ label: "Not locked to DigiGate", tone: "warning" });
  }
  if (data?.bundleMb) {
    const left = data.bundleMb * MB - data.usedBytes;
    if (left <= 0) found.push({ label: "Data bundle finished", tone: "blocked" });
    else if (left < data.bundleMb * MB * LOW_DATA) found.push({ label: "Data running low", tone: "warning" });
  }
  return found.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "blocked" ? -1 : 1));
}
