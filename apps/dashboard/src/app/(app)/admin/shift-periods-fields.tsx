"use client";

import { MAX_SHIFT_LABEL, MAX_SHIFT_PERIODS, shiftCodeFor, shiftLengthMinutes, type ShiftPeriod } from "@digigate/core";
import { useState } from "react";

import { Field } from "@/components/form";

const lengthLine = (period: ShiftPeriod) => {
  const minutes = shiftLengthMinutes(period);
  if (minutes === null) return "Starts and ends at the same time";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}${rest ? ` ${rest} min` : ""}`;
};

/** A site's shift times inside a popup form: each with a name and when it starts and ends. Sent as one field. */
export function ShiftPeriodsFields({ defaults }: { defaults: readonly ShiftPeriod[] }) {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([...defaults]);
  const update = (index: number, changes: Partial<ShiftPeriod>) =>
    setPeriods((current) => current.map((period, at) => (at === index ? { ...period, ...changes, code: shiftCodeFor(changes.label ?? period.label) } : period)));
  const remove = (index: number) => setPeriods((current) => current.filter((_, at) => at !== index));
  const add = () => setPeriods((current) => [...current, { code: shiftCodeFor(`Shift ${current.length + 1}`), label: `Shift ${current.length + 1}`, start: "08:00", end: "16:00" }]);

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="periods" value={JSON.stringify(periods)} />
      <p className="text-sm text-ink-muted">Guards pick one of these when they start a shift. A shift that ends before it starts runs past midnight.</p>
      <ul className="flex flex-col gap-3">
        {periods.map((period, index) => (
          <li key={`period-${index}`} className="rounded-md border border-border p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
              <Field label="Name" value={period.label} maxLength={MAX_SHIFT_LABEL} onChange={(event) => update(index, { label: event.target.value })} autoComplete="off" />
              <Field label="Starts" type="time" value={period.start} onChange={(event) => update(index, { start: event.target.value })} />
              <Field label="Ends" type="time" value={period.end} onChange={(event) => update(index, { end: event.target.value })} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-ink-muted">{lengthLine(period)}</p>
              {periods.length > 1 ? (
                <button type="button" onClick={() => remove(index)} className="text-xs font-semibold text-blocked hover:underline">
                  Remove
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {periods.length < MAX_SHIFT_PERIODS ? (
        <button type="button" onClick={add} className="self-start rounded-pill bg-surface-muted px-4 py-2 text-sm font-semibold text-ink transition hover:bg-border">
          Add a shift
        </button>
      ) : null}
    </div>
  );
}
