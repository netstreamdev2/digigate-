// What an access point is, how it's worded, and what makes one complete. Shared by the site wizard, the access point
// forms and the server actions that save them, so all three agree.

export const GATE_TYPES = {
  main: "Main gate",
  pedestrian: "Pedestrian gate",
  contractor: "Contractor gate",
  service: "Service gate",
} as const;

export type GateType = keyof typeof GATE_TYPES;

export type Lane = "vehicle" | "pedestrian";

export const LANE_LABELS: Record<Lane, string> = { vehicle: "Vehicles", pedestrian: "Pedestrians" };

export type BoomMode = "automatic" | "manual";

export const MAX_ACCESS_POINTS = 30;
export const MAX_BOOMS = 12;
export const MAX_CAMERAS = 50;
/** GPS drifts by tens of metres, so a smaller fence would warn guards standing at their post. */
export const MIN_FENCE_METRES = 30;
export const MAX_FENCE_METRES = 1000;

export type AccessPointDraft = {
  label: string;
  gateType: GateType;
  lanes: Lane[];
  booms: BoomMode[];
  manned: boolean;
  cctvCameras: number;
  anpr: boolean;
  /** As pasted from Google Maps, e.g. "-29.85, 31.02". Empty leaves the geofence off. */
  location: string;
  radiusM: number;
};

export const NEW_ACCESS_POINT: AccessPointDraft = {
  label: "",
  gateType: "main",
  lanes: ["vehicle", "pedestrian"],
  booms: ["automatic", "automatic"],
  manned: true,
  cctvCameras: 0,
  anpr: false,
  location: "",
  radiusM: 50,
};

export const isGateType = (value: unknown): value is GateType => typeof value === "string" && value in GATE_TYPES;
const isLane = (value: unknown): value is Lane => value === "vehicle" || value === "pedestrian";
const isBoomMode = (value: unknown): value is BoomMode => value === "automatic" || value === "manual";

/** A pasted location, null when it's left empty, or "invalid" when it can't be read. */
export function parseLocation(text: string): { latitude: number; longitude: number } | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const [latitude, longitude, ...rest] = trimmed.split(/[\s,]+/).filter(Boolean).map(Number);
  if (rest.length > 0 || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return "invalid";
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : "invalid";
}

/** What's still wrong with an access point, in plain words, or null when it's ready to save. */
export function accessPointProblem(draft: AccessPointDraft): string | null {
  if (!draft.label.trim()) return "Give the access point a name, like Main Gate.";
  if (draft.lanes.length === 0) return "Choose vehicles, pedestrians, or both.";
  if (draft.anpr && draft.cctvCameras === 0) return "ANPR needs at least one camera.";
  if (parseLocation(draft.location) === "invalid") return "Paste the latitude and longitude, like -29.8587, 31.0218.";
  if (!Number.isInteger(draft.radiusM) || draft.radiusM < MIN_FENCE_METRES || draft.radiusM > MAX_FENCE_METRES) {
    return `The geofence must be between ${MIN_FENCE_METRES} and ${MAX_FENCE_METRES} metres.`;
  }
  return null;
}

/** A draft read back from a form or the wizard, checked field by field: never trusted as it arrives. */
export function readAccessPoint(value: unknown): AccessPointDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const draft = value as Record<string, unknown>;
  const lanes = Array.isArray(draft.lanes) ? draft.lanes.filter(isLane) : [];
  const booms = Array.isArray(draft.booms) ? draft.booms.filter(isBoomMode).slice(0, MAX_BOOMS) : [];
  const cameras = Number(draft.cctvCameras);
  const radius = Number(draft.radiusM);
  return {
    label: typeof draft.label === "string" ? draft.label.trim().slice(0, 80) : "",
    gateType: isGateType(draft.gateType) ? draft.gateType : "main",
    lanes: [...new Set(lanes)],
    booms,
    manned: draft.manned !== false,
    cctvCameras: Number.isInteger(cameras) ? Math.min(MAX_CAMERAS, Math.max(0, cameras)) : 0,
    anpr: draft.anpr === true,
    location: typeof draft.location === "string" ? draft.location : "",
    radiusM: Number.isInteger(radius) ? radius : NEW_ACCESS_POINT.radiusM,
  };
}

/** The columns an access point is saved as. Call only once accessPointProblem has passed. */
export function accessPointColumns(draft: AccessPointDraft) {
  const location = parseLocation(draft.location);
  const place = location && location !== "invalid" ? location : null;
  return {
    label: draft.label,
    gate_type: draft.gateType,
    lanes: draft.lanes,
    booms: draft.lanes.includes("vehicle") ? draft.booms : [],
    manned: draft.manned,
    cctv_cameras: draft.cctvCameras,
    anpr: draft.anpr,
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    radius_m: draft.radiusM,
  };
}

export function lanesLine(lanes: readonly string[]): string {
  return lanes.map((lane) => (isLane(lane) ? LANE_LABELS[lane] : lane)).join(" and ");
}

export function boomsLine(booms: readonly string[]): string {
  if (booms.length === 0) return "No booms";
  const manual = booms.filter((boom) => boom === "manual").length;
  const total = `${booms.length} boom${booms.length === 1 ? "" : "s"}`;
  if (manual === 0) return `${total}, all automatic`;
  return manual === booms.length ? `${total}, all manual` : `${total}, ${manual} manual`;
}

export function camerasLine(cameras: number, anpr: boolean): string {
  if (cameras === 0) return "No CCTV";
  return `${cameras} camera${cameras === 1 ? "" : "s"}${anpr ? ", ANPR" : ", no ANPR"}`;
}
