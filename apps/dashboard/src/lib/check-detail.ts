// One gate check in full, as digigate.check_detail sends it, read field by field: the popup never trusts the shape.

import { occupantsOf, type OccupantsBySex } from "@digigate/core";

export type CheckDetail = {
  id: string;
  direction: "in" | "out";
  lane: "vehicle" | "pedestrian";
  occurredAt: string;
  outcome: "clear" | "warning" | "blocked";
  ruleCodes: string[];
  detailsErased: boolean;
  inFull: boolean;
  visitType: string | null;
  enteredAt: string | null;
  exitedAt: string | null;
  /** When the stay recorded at entry runs out, and how long it was; null for no limit. */
  expectedUntil: string | null;
  expectedStayMinutes: number | null;
  post: string | null;
  guard: string | null;
  person: { name: string | null; licenceExpiresOn: string | null; vehicleCodes: string[]; typed: boolean };
  vehicle: { plate: string | null; make: string | null; model: string | null; colour: string | null; description: string | null; discExpiresOn: string | null; typed: boolean } | null;
  typedPlate: string | null;
  occupants: number | null;
  occupantsBySex: OccupantsBySex | null;
  /** At an exit: how many came in with the car, and who, and the guard's reason when the count changed. */
  occupantsCameIn: number | null;
  occupantsCameInBySex: OccupantsBySex | null;
  occupantReason: string | null;
  hasLicencePhoto: boolean;
  hasPlatePhoto: boolean;
  /** How the guard gave the plate, for checks made since plate photos began. */
  plateEntry: { source: "photo" | "typed"; photo: boolean; readFromPhoto: string | null; warnedPlate: string | null } | null;
  /** The hotlist entry that stopped the check, inside the 365 days records are shown in full. */
  hotlist: { label: string; reason: string; guardNote: string; removed: boolean } | null;
};

function plateEntryOf(value: unknown): CheckDetail["plateEntry"] {
  if (typeof value !== "object" || value === null) return null;
  const entry = record(value);
  return {
    source: entry.source === "photo" ? "photo" : "typed",
    photo: entry.photo === true,
    readFromPhoto: text(entry.readFromPhoto),
    warnedPlate: text(entry.warnedPlate),
  };
}

function hotlistOf(value: unknown): CheckDetail["hotlist"] {
  const entry = record(value);
  const label = text(entry.label);
  const reason = text(entry.reason);
  const guardNote = text(entry.guardNote);
  return label && reason && guardNote ? { label, reason, guardNote, removed: entry.removed === true } : null;
}

const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const texts = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function readCheckDetail(value: unknown): CheckDetail | null {
  const row = record(value);
  const id = text(row.id);
  const type = text(row.type);
  const occurredAt = text(row.occurredAt);
  if (!id || !type || !occurredAt) return null;
  const person = record(row.person);
  const vehicle = row.vehicle ? record(row.vehicle) : null;
  const outcome = row.outcome === "blocked" || row.outcome === "warning" ? row.outcome : "clear";
  return {
    id,
    direction: type.endsWith("_exit") ? "out" : "in",
    lane: type.startsWith("vehicle") ? "vehicle" : "pedestrian",
    occurredAt,
    outcome,
    ruleCodes: texts(row.ruleCodes),
    detailsErased: row.detailsErased === true,
    inFull: row.inFull === true,
    visitType: text(row.visitType),
    enteredAt: text(row.enteredAt),
    exitedAt: text(row.exitedAt),
    expectedUntil: text(row.expectedUntil),
    expectedStayMinutes: typeof row.expectedStayMinutes === "number" ? row.expectedStayMinutes : null,
    post: text(row.post),
    guard: text(row.guard),
    person: { name: text(person.name), licenceExpiresOn: text(person.licenceExpiresOn), vehicleCodes: texts(person.vehicleCodes), typed: person.typed === true },
    vehicle: vehicle
      ? {
          plate: text(vehicle.plate),
          make: text(vehicle.make),
          model: text(vehicle.model),
          colour: text(vehicle.colour),
          description: text(vehicle.description),
          discExpiresOn: text(vehicle.discExpiresOn),
          typed: vehicle.typed === true,
        }
      : null,
    typedPlate: text(row.typedPlate),
    occupants: typeof row.occupants === "number" ? row.occupants : null,
    occupantsBySex: occupantsOf(row.occupantsBySex),
    occupantsCameIn: typeof row.occupantsCameIn === "number" ? row.occupantsCameIn : null,
    occupantsCameInBySex: occupantsOf(row.occupantsCameInBySex),
    occupantReason: text(row.occupantReason),
    hasLicencePhoto: row.hasLicencePhoto === true,
    hasPlatePhoto: row.hasPlatePhoto === true,
    plateEntry: plateEntryOf(row.plateEntry),
    hotlist: hotlistOf(row.hotlist),
  };
}
