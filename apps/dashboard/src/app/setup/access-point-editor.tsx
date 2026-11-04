"use client";

import { useId, useState, type ReactNode } from "react";

import { Field, SelectField } from "@/components/form";
import { LocationMap } from "@/components/location-map";
import {
  GATE_TYPES,
  isGateType,
  LANE_LABELS,
  MAX_BOOMS,
  MAX_CAMERAS,
  MAX_FENCE_METRES,
  MIN_FENCE_METRES,
  NEW_ACCESS_POINT,
  type AccessPointDraft,
  type BoomMode,
  type Lane,
} from "@/lib/access-points";

const STEP_BUTTON = "grid size-10 place-items-center rounded-pill bg-surface-muted text-lg font-semibold text-ink transition hover:bg-border disabled:opacity-40";

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {children}
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </fieldset>
  );
}

/** A whole number picked with − and +, never typed, so it can't be out of range. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (next: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={STEP_BUTTON} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`One ${label} fewer`}>
        −
      </button>
      <span className="min-w-8 text-center font-display text-xl font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={STEP_BUTTON} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`One ${label} more`}>
        +
      </button>
    </div>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-semibold transition ${on ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
    >
      {label}
    </button>
  );
}

type Near = { latitude: number; longitude: number } | null;

/**
 * Everything about one access point, controlled from outside so the site wizard can keep several at once. `near` is the
 * site's own location, where the map starts.
 */
export function AccessPointEditor({ value, onChange, near = null }: { value: AccessPointDraft; onChange: (next: AccessPointDraft) => void; near?: Near }) {
  const id = useId();
  const set = (changes: Partial<AccessPointDraft>) => onChange({ ...value, ...changes });
  const hasVehicles = value.lanes.includes("vehicle");

  const toggleLane = (lane: Lane) => {
    const lanes = value.lanes.includes(lane) ? value.lanes.filter((item) => item !== lane) : [...value.lanes, lane];
    set({ lanes });
  };
  const setBoomCount = (count: number) =>
    set({ booms: Array.from({ length: count }, (_, index): BoomMode => value.booms[index] ?? "automatic") });
  const flipBoom = (index: number) =>
    set({ booms: value.booms.map((boom, at): BoomMode => (at === index ? (boom === "automatic" ? "manual" : "automatic") : boom)) });
  const setCameras = (cctvCameras: number) => set({ cctvCameras, anpr: cctvCameras === 0 ? false : value.anpr });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Access point name" value={value.label} onChange={(event) => set({ label: event.target.value })} placeholder="Main Gate" autoComplete="off" />
        <SelectField
          label="What kind of gate"
          value={value.gateType}
          onChange={(event) => set({ gateType: isGateType(event.target.value) ? event.target.value : "main" })}
        >
          {Object.entries(GATE_TYPES).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      <Group label="It handles">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LANE_LABELS) as Lane[]).map((lane) => (
            <Toggle key={lane} on={value.lanes.includes(lane)} label={LANE_LABELS[lane]} onChange={() => toggleLane(lane)} />
          ))}
        </div>
      </Group>

      {hasVehicles ? (
        <Group label="Booms" hint="Tap a boom to switch it between automatic and manual.">
          <Stepper value={value.booms.length} min={0} max={MAX_BOOMS} onChange={setBoomCount} label="boom" />
          {value.booms.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {value.booms.map((boom, index) => (
                <button
                  key={`${id}-boom-${index}`}
                  type="button"
                  onClick={() => flipBoom(index)}
                  className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${boom === "manual" ? "border-warning bg-warning-soft" : "border-border bg-surface hover:bg-surface-muted"}`}
                >
                  <span className="text-ink-muted">{`Boom ${index + 1}`}</span>
                  <span className="font-semibold">{boom === "automatic" ? "Automatic" : "Manual"}</span>
                </button>
              ))}
            </div>
          ) : null}
        </Group>
      ) : null}

      <Group label="Staffing">
        <div className="flex flex-wrap gap-2">
          <Toggle on={value.manned} label="Manned" onChange={() => set({ manned: true })} />
          <Toggle on={!value.manned} label="Unmanned" onChange={() => set({ manned: false })} />
        </div>
      </Group>

      <Group label="CCTV cameras" hint="ANPR cameras read number plates, which DigiGate can use later for automation.">
        <Stepper value={value.cctvCameras} min={0} max={MAX_CAMERAS} onChange={setCameras} label="camera" />
        {value.cctvCameras > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Toggle on={value.anpr} label="With ANPR" onChange={() => set({ anpr: true })} />
            <Toggle on={!value.anpr} label="Normal CCTV only" onChange={() => set({ anpr: false })} />
          </div>
        ) : null}
      </Group>

      <Group
        label="Where it is"
        hint="A guard who goes further than the geofence is warned, and the control room is told. Leave it empty to set it later, here or from the handheld at the gate."
      >
        <LocationMap location={value.location} radiusM={value.radiusM} onLocation={(location) => set({ location })} near={near} />
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field
            label="Or type the latitude and longitude"
            value={value.location}
            onChange={(event) => set({ location: event.target.value })}
            placeholder="-29.8587, 31.0218"
            autoComplete="off"
          />
          <Field
            label="Geofence, in metres"
            type="number"
            inputMode="numeric"
            min={MIN_FENCE_METRES}
            max={MAX_FENCE_METRES}
            value={value.radiusM}
            onChange={(event) => set({ radiusM: Number(event.target.value) })}
          />
        </div>
      </Group>
    </div>
  );
}

/** The editor inside a popup form: it keeps its own state and sends it with the form. */
export function AccessPointFormFields({ defaults = NEW_ACCESS_POINT, near = null }: { defaults?: AccessPointDraft; near?: Near }) {
  const [draft, setDraft] = useState(defaults);
  return (
    <>
      <input type="hidden" name="accessPoint" value={JSON.stringify(draft)} />
      <AccessPointEditor value={draft} onChange={setDraft} near={near} />
    </>
  );
}
