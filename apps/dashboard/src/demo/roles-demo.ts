// Made-up people, sites and numbers for the role dashboards mock-up. Phase 2 replaces this with Supabase data.
import type { NavItem } from "@/components/sidebar";
import type { Status } from "@/components/status-chip";

import type { DemoAlert, Kpi } from "./dashboard-demo";

export const navSecurityManager: readonly NavItem[] = [
  { label: "Overview", icon: "overview-filled", active: true },
  { label: "Live on site", icon: "on-site" },
  { label: "Visits", icon: "visits" },
  { label: "Alerts", icon: "alerts", badge: 3 },
  { label: "People", icon: "people" },
  { label: "Approvals", icon: "approvals", badge: 2 },
  { label: "Users", icon: "users" },
  { label: "Sites & gates", icon: "sites" },
  { label: "Reports", icon: "reports" },
  { label: "Audit log", icon: "audit-log" },
  { label: "Settings", icon: "settings" },
];

// Super admin: every site, every user, every record.

export const navSuperAdmin: readonly NavItem[] = [
  { label: "All sites", icon: "overview-filled", active: true },
  { label: "Sites & gates", icon: "sites" },
  { label: "Users & roles", icon: "users" },
  { label: "Devices", icon: "device" },
  { label: "Alerts", icon: "alerts", badge: 7 },
  { label: "Reports", icon: "reports" },
  { label: "Audit log", icon: "audit-log" },
  { label: "Settings", icon: "settings" },
];

export const superAdminUser = { name: "Ayanda K.", role: "Super admin" };

export const superAdminKpis: readonly Kpi[] = [
  { label: "Sites", value: "4", icon: "sites", detail: "2 hospitals, 2 estates" },
  { label: "People on site", value: "342", icon: "people", detail: "Across every site" },
  { label: "Devices online", value: "11 of 12", icon: "device", detail: "1 offline at Northgate" },
  { label: "Open alerts", value: "7", icon: "alerts", detail: "2 blocked at a gate", tone: "blocked" },
];

export type SiteRow = {
  id: string;
  name: string;
  type: string;
  onSite: number;
  entriesToday: number;
  openAlerts: number;
  devices: string;
  status: Status;
};

export const siteRows: readonly SiteRow[] = [
  { id: "s1", name: "Demo Hospital", type: "Hospital", onSite: 118, entriesToday: 316, openAlerts: 3, devices: "3 of 3", status: "blocked" },
  { id: "s2", name: "Northgate Hospital", type: "Hospital", onSite: 87, entriesToday: 251, openAlerts: 2, devices: "3 of 4", status: "warning" },
  { id: "s3", name: "Riverside Estate", type: "Estate", onSite: 96, entriesToday: 204, openAlerts: 1, devices: "2 of 2", status: "warning" },
  { id: "s4", name: "Hilltop Estate", type: "Estate", onSite: 41, entriesToday: 88, openAlerts: 1, devices: "3 of 3", status: "clear" },
];

export const superAdminAlerts: readonly DemoAlert[] = [
  { id: "sa1", code: "DRIVER_VEHICLE_MISMATCH", gate: "Demo Hospital · Main Gate", time: "12:01", summary: "Sipho D. tried to leave in a car another visitor brought in. Boom held." },
  { id: "sa2", code: "DISC_CLONE_ON_SITE", gate: "Northgate Hospital · Main Gate", time: "11:24", summary: "Two cars on site carry the same number plate. Both stopped for checks." },
  { id: "sa3", code: "OVERSTAY", gate: "Riverside Estate · Main Gate", time: "09:50", summary: "Contractor on site 2h past the agreed time." },
];

export const superAdminPowers: readonly string[] = [
  "Create sites, gates and the rules each site follows",
  "Add, change or remove any user at any site",
  "Pair new gate devices and switch off lost ones",
  "Open any visit, alert or audit record",
  "Close alerts and approve staff at any site",
  "Export reports for one site or all of them",
];

export const entriesBySiteType = [
  { label: "Hospitals", entries: 567 },
  { label: "Estates", entries: 292 },
] as const;

// Site admin: runs one site.

export const navSiteAdmin: readonly NavItem[] = [
  { label: "Site overview", icon: "overview-filled", active: true },
  { label: "People", icon: "people" },
  { label: "Approvals", icon: "approvals", badge: 2 },
  { label: "Guards", icon: "guard" },
  { label: "Devices", icon: "device" },
  { label: "Gates", icon: "sites" },
  { label: "Site rules", icon: "site-config" },
  { label: "Reports", icon: "reports" },
];

export const siteAdminUser = { name: "Bongani M.", role: "Site admin, Demo Hospital" };

export const siteAdminKpis: readonly Kpi[] = [
  { label: "Guards", value: "14", icon: "guard", detail: "3 on shift now" },
  { label: "Registered staff", value: "412", icon: "staff", detail: "Doctors, nurses, cleaners" },
  { label: "Waiting for approval", value: "2", icon: "approvals", detail: "Enrolled at the gate today" },
  { label: "Gate devices", value: "3", icon: "device", detail: "1 needs attention", tone: "blocked" },
];

export const pendingStaff = [
  { id: "p1", name: "Dr T. Mahlangu", category: "Doctor", enrolledBy: "Thabo K.", at: "07:42" },
  { id: "p2", name: "N. Zulu", category: "Nurse", enrolledBy: "Zanele M.", at: "08:15" },
] as const;

export const guardRows = [
  { id: "g1", name: "Thabo Khumalo", employeeNumber: "1001", role: "Guard", where: "Main Gate since 06:00", status: "clear" as Status, statusLabel: "On shift" },
  { id: "g2", name: "Zanele Mthembu", employeeNumber: "1002", role: "Guard", where: "Staff Gate since 06:00", status: "clear" as Status, statusLabel: "On shift" },
  { id: "g3", name: "Kagiso Molefe", employeeNumber: "2001", role: "Supervisor", where: "Control room since 06:00", status: "clear" as Status, statusLabel: "On shift" },
  { id: "g4", name: "Lwazi Dube", employeeNumber: "1004", role: "Guard", where: "Last shift ended 18:00 yesterday", status: "info" as Status, statusLabel: "Off shift" },
] as const;

export const deviceRows = [
  { id: "d1", name: "Main Gate DT50", gate: "Main Gate · Vehicle lane", sync: "Synced 1 min ago", status: "clear" as Status },
  { id: "d2", name: "Staff Gate DT50", gate: "Staff Gate · Vehicle lane", sync: "Synced 2 min ago", status: "clear" as Status },
  { id: "d3", name: "Pedestrian Gate DT50", gate: "Pedestrian Gate", sync: "Offline 14 min · 3 records waiting", status: "warning" as Status },
] as const;

// Control room: watches the gates live.

export const navControlRoom: readonly NavItem[] = [
  { label: "Live", icon: "on-site", active: true },
  { label: "Alerts", icon: "alerts", badge: 3 },
  { label: "Visits", icon: "visits" },
  { label: "Gates", icon: "sites" },
  { label: "People on site", icon: "people" },
];

export const controlRoomUser = { name: "Kagiso M.", role: "Control room, Demo Hospital" };

export const controlRoomKpis: readonly Kpi[] = [
  { label: "People on site", value: "118", icon: "people", detail: "+14 in the last hour" },
  { label: "Cars on site", value: "64", icon: "vehicle", detail: "Capacity 220" },
  { label: "Gates online", value: "2 of 3", icon: "device", detail: "Pedestrian Gate offline" },
  { label: "Open alerts", value: "3", icon: "alerts", detail: "1 blocked at the gate", tone: "blocked" },
];

export const gateRows = [
  { id: "gt1", gate: "Main Gate", lane: "Vehicle lane", guard: "Thabo K.", lastScan: "12:07", status: "clear" as Status, statusLabel: "Online" },
  { id: "gt2", gate: "Staff Gate", lane: "Vehicle lane", guard: "Zanele M.", lastScan: "11:58", status: "clear" as Status, statusLabel: "Online" },
  { id: "gt3", gate: "Pedestrian Gate", lane: "On foot", guard: "Lwazi D.", lastScan: "11:53", status: "warning" as Status, statusLabel: "Offline" },
] as const;

// KPI supervisor: how well the gates are run over time.

export const navKpi: readonly NavItem[] = [
  { label: "Performance", icon: "reports", active: true },
  { label: "Guards", icon: "guard" },
  { label: "Visits", icon: "visits" },
  { label: "Alerts", icon: "alerts" },
  { label: "Exports", icon: "download" },
];

export const kpiUser = { name: "Thandi N.", role: "KPI supervisor" };

export const kpiTiles: readonly Kpi[] = [
  { label: "Average time per car", value: "14 s", icon: "duration", detail: "Target is under 15 s" },
  { label: "Entries this week", value: "2,184", icon: "entry", detail: "6% more than last week" },
  { label: "Alerts per 100 entries", value: "1.4", icon: "alerts", detail: "Down from 1.9 last week" },
  { label: "Supervisor overrides", value: "6", icon: "override", detail: "Each one has a reason" },
];

export const weekEntriesByHour = [
  { hour: "06:00", entries: 22 },
  { hour: "07:00", entries: 46 },
  { hour: "08:00", entries: 68 },
  { hour: "09:00", entries: 61 },
  { hour: "10:00", entries: 50 },
  { hour: "11:00", entries: 44 },
  { hour: "12:00", entries: 39 },
  { hour: "13:00", entries: 41 },
  { hour: "14:00", entries: 57 },
  { hour: "15:00", entries: 63 },
  { hour: "16:00", entries: 49 },
  { hour: "17:00", entries: 35 },
] as const;

export const guardPerformance = [
  { id: "gp1", name: "Thabo Khumalo", shifts: 5, scans: 612, average: "12 s", manual: 3, overrides: 1 },
  { id: "gp2", name: "Zanele Mthembu", shifts: 5, scans: 540, average: "13 s", manual: 5, overrides: 2 },
  { id: "gp3", name: "Kagiso Molefe", shifts: 4, scans: 188, average: "14 s", manual: 2, overrides: 0 },
  { id: "gp4", name: "Lwazi Dube", shifts: 4, scans: 401, average: "19 s", manual: 14, overrides: 3 },
] as const;
