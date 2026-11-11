import { ruleTitle } from "@digigate/core";

import type { CheckRow, OldSystemFacts } from "@/app/(app)/control-room/check-activity";

import type { Check } from "./control-room";
import { duration, labelFor, shortDate, timeOfDay } from "./format";

const NO_VALUE = "—";

/** How long the visit behind a check lasted, or has lasted so far. */
function stayOf(check: Check, now: number): string {
  if (!check.enteredAt || !check.visitOpened) return NO_VALUE;
  return check.exitedAt ? duration(check.enteredAt, check.exitedAt) : `${duration(check.enteredAt, now)} so far`;
}

/**
 * A blocked or warned check stays that way on record. When its visit went ahead anyway (an entry whose visit opened,
 * an exit whose visit closed) someone let it through, and the chip says so.
 */
function resultOf(check: Check): Pick<CheckRow, "result" | "resultLabel"> {
  const went = check.direction === "in" ? check.visitOpened : check.exitedAt !== null;
  if (check.outcome === "blocked") return went ? { result: "warning", resultLabel: "Overridden" } : { result: "blocked", resultLabel: null };
  if (check.outcome === "warning") return { result: "warning", resultLabel: went ? "Let through" : null };
  return { result: "clear", resultLabel: null };
}

/**
 * One check as the tables show it. `withDay` puts the date before the time, for lists that run over several days. A
 * check from the site's old gate system had no result and no paired visit, so it says where it came from instead.
 */
export function checkRowOf(check: Check & { oldSystem?: OldSystemFacts | null }, gate: string, now: number, withDay = false): CheckRow {
  const oldSystem = check.oldSystem ?? null;
  return {
    id: check.id,
    time: withDay ? `${shortDate(check.occurredAt)}, ${timeOfDay(check.occurredAt)}` : timeOfDay(check.occurredAt),
    person: check.person,
    visitType: check.visitType ? labelFor(check.visitType) : NO_VALUE,
    direction: check.direction,
    vehicle: check.vehicle ?? "Pedestrian",
    plate: check.plate ?? NO_VALUE,
    gate,
    stay: oldSystem ? NO_VALUE : stayOf(check, now),
    ...(oldSystem ? { result: "info" as const, resultLabel: "Logged" } : resultOf(check)),
    alerts: check.ruleCodes.map(ruleTitle),
    oldSystem,
  };
}
