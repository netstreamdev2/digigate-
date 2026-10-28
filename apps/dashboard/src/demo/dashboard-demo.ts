// Made-up activity for the dashboard mock-up, consistent with the gate app's demo. Phase 2 replaces this
// with Supabase queries. Names are shortened and plates masked, as the real dashboard will show them.
import type { RuleCode } from "@digigate/core";

import type { IconName } from "@/components/icon";

export const demoSite = {
  name: "Demo Hospital",
  manager: "Naledi",
  managerFullName: "Naledi M.",
  date: "Wednesday 28 October",
  updatedAt: "12:08",
} as const;

export type Kpi = {
  label: string;
  value: string;
  icon: IconName;
  detail?: string;
  tone?: "neutral" | "blocked";
};

export const demoKpis: readonly Kpi[] = [
  { label: "People on site", value: "118", icon: "people", detail: "+14 in the last hour" },
  { label: "Cars on site", value: "64", icon: "vehicle", detail: "Capacity 220" },
  { label: "Average time on site", value: "1h 36m", icon: "duration", detail: "Visitors only" },
  { label: "Open alerts", value: "3", icon: "alerts", detail: "1 blocked at the gate", tone: "blocked" },
];

/** Entries per hour today. The 12:00 bucket is the current, partial hour. */
export const demoEntriesByHour = [
  { hour: "06:00", entries: 24 },
  { hour: "07:00", entries: 48 },
  { hour: "08:00", entries: 71 },
  { hour: "09:00", entries: 66 },
  { hour: "10:00", entries: 55 },
  { hour: "11:00", entries: 43 },
  { hour: "12:00", entries: 9 },
] as const;

export const demoEntriesByType = [
  { label: "Visitors", entries: 210 },
  { label: "Staff", entries: 63 },
  { label: "Contractors", entries: 43 },
] as const;

export type DemoAlert = {
  id: string;
  code: RuleCode;
  gate: string;
  time: string;
  summary: string;
};

export const demoAlerts: readonly DemoAlert[] = [
  {
    id: "alert-swap",
    code: "DRIVER_VEHICLE_MISMATCH",
    gate: "Main Gate",
    time: "12:01",
    summary: "Sipho D. tried to leave in a car another visitor brought in. Boom held.",
  },
  {
    id: "alert-overstay",
    code: "OVERSTAY",
    gate: "Service Gate",
    time: "10:41",
    summary: "Contractor Johan V. is 1h 27m past the 4-hour limit.",
  },
  {
    id: "alert-disc",
    code: "DISC_EXPIRED",
    gate: "Main Gate",
    time: "11:52",
    summary: "CA ***-219 entered with a disc that expired on 2 Sep 2026. Guard acknowledged.",
  },
];

export const demoBlockedVisit = {
  initials: "SD",
  name: "Sipho D.",
  visitType: "Visitor",
  fields: [
    { label: "Licence", value: "*****318" },
    { label: "Time on site", value: "1h 49m" },
    { label: "Arrived in", value: "VW Polo · CA ***-654 · 10:12", wide: true },
    { label: "Trying to leave in", value: "Toyota Corolla · CA ***-456", wide: true },
    { label: "That car came in with", value: "Lerato M. at 09:31", wide: true },
    { label: "Guard on duty", value: "Thabo K." },
  ],
} as const;

export type DemoActivity = {
  id: string;
  time: string;
  person: string;
  visitType: string;
  direction: "in" | "out";
  vehicle: string;
  plate: string;
  gate: string;
  stay: string;
  result: "clear" | "warning" | "blocked";
};

export const demoActivity: readonly DemoActivity[] = [
  { id: "a1", time: "12:01", person: "Sipho D.", visitType: "Visitor", direction: "out", vehicle: "Toyota Corolla", plate: "CA ***-456", gate: "Main Gate", stay: "1h 49m", result: "blocked" },
  { id: "a2", time: "11:58", person: "Dr A. Naidoo", visitType: "Staff", direction: "in", vehicle: "BMW 3 Series", plate: "ND ***-112", gate: "Staff Gate", stay: "—", result: "clear" },
  { id: "a3", time: "11:55", person: "Ayesha P.", visitType: "Visitor", direction: "in", vehicle: "On foot", plate: "—", gate: "Pedestrian Gate", stay: "—", result: "clear" },
  { id: "a4", time: "11:52", person: "Pieter S.", visitType: "Visitor", direction: "in", vehicle: "Ford Ranger", plate: "CA ***-219", gate: "Main Gate", stay: "—", result: "warning" },
  { id: "a5", time: "11:47", person: "Lindiwe Z.", visitType: "Visitor", direction: "out", vehicle: "Kia Picanto", plate: "CA ***-307", gate: "Main Gate", stay: "1h 12m", result: "clear" },
  { id: "a6", time: "11:40", person: "Rui F.", visitType: "Contractor", direction: "in", vehicle: "Mercedes Sprinter", plate: "CA ***-029", gate: "Service Gate", stay: "—", result: "clear" },
  { id: "a7", time: "11:36", person: "Nomsa K.", visitType: "Staff", direction: "out", vehicle: "Toyota Yaris", plate: "NU ***-418", gate: "Staff Gate", stay: "4h 05m", result: "clear" },
  { id: "a8", time: "11:31", person: "Grace T.", visitType: "Visitor", direction: "in", vehicle: "Hyundai i20", plate: "CA ***-561", gate: "Main Gate", stay: "—", result: "clear" },
];
