"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Field, FormProblem, SelectField } from "@/components/form";
import { Icon } from "@/components/icon";
import { LocationMap } from "@/components/location-map";
import { StatusChip } from "@/components/status-chip";
import {
  accessPointProblem,
  boomsLine,
  camerasLine,
  GATE_TYPES,
  lanesLine,
  MAX_ACCESS_POINTS,
  NEW_ACCESS_POINT,
  parseLocation,
  type AccessPointDraft,
} from "@/lib/access-points";

import { AccessPointEditor, Stepper } from "./access-point-editor";
import { AddressSearch } from "./address-search";
import { createSite } from "./actions";

export type SiteDraft = {
  name: string;
  siteType: "hospital" | "estate";
  code: string;
  address: string;
  location: string;
  radiusM: number;
  openParking: boolean;
  parkingSpaces: string;
};

const SITE_TYPES = { hospital: "Hospital", estate: "Residential estate" } as const;
const STEPS = ["The site", "Access points", "Check and create"] as const;
const SITE_RADIUS = { min: 30, max: 20000 } as const;

const MAIN = "inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink disabled:opacity-50";
const QUIET = "inline-flex h-11 items-center justify-center rounded-pill bg-surface-muted px-5 text-sm font-semibold text-ink transition hover:bg-border";

/** What's still wrong with the site details, or null when they're ready. */
function siteProblem(site: SiteDraft): string | null {
  if (!site.name.trim()) return "Give the site a name, like Riverside Hospital or Westway Mall.";
  if (site.code && !/^[A-Z0-9]{2,8}$/.test(site.code)) return "The site code is 2 to 8 letters or numbers, like DCH.";
  if (parseLocation(site.location) === "invalid") return "Paste the site's latitude and longitude, like -29.8587, 31.0218.";
  if (parseLocation(site.location) && (!Number.isInteger(site.radiusM) || site.radiusM < SITE_RADIUS.min || site.radiusM > SITE_RADIUS.max)) {
    return `The site's geofence must be between ${SITE_RADIUS.min} and ${SITE_RADIUS.max} metres.`;
  }
  if (!site.openParking && !(Number(site.parkingSpaces) >= 1)) return "Say how many parking spaces the site has.";
  return null;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="dg-glass p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Choice({ on, label, onPick }: { on: boolean; label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-semibold transition ${on ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
    >
      {label}
    </button>
  );
}

function SiteStep({ site, onChange }: { site: SiteDraft; onChange: (next: SiteDraft) => void }) {
  const set = (changes: Partial<SiteDraft>) => onChange({ ...site, ...changes });
  return (
    <Card title="The site" subtitle="The hospital, estate or mall the company guards. Everything here can be changed later.">
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem_10rem]">
          <Field label="Site name" value={site.name} onChange={(event) => set({ name: event.target.value })} placeholder="Riverside Hospital" autoFocus autoComplete="off" />
          <SelectField label="Site type" value={site.siteType} onChange={(event) => set({ siteType: event.target.value === "estate" ? "estate" : "hospital" })}>
            {Object.entries(SITE_TYPES).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </SelectField>
          <Field
            label="Site code"
            value={site.code}
            onChange={(event) => set({ code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) })}
            placeholder="DCH"
            autoComplete="off"
          />
        </div>
        <AddressSearch
          value={site.address}
          onChange={(address) => set({ address })}
          onPick={(place) =>
            set({
              address: place.address,
              location: `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`,
              name: site.name.trim() ? site.name : place.name,
            })
          }
        />
        <LocationMap location={site.location} radiusM={site.radiusM} onLocation={(location) => set({ location })} />
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field
            label="Or type the latitude and longitude"
            value={site.location}
            onChange={(event) => set({ location: event.target.value })}
            placeholder="-29.8587, 31.0218"
            autoComplete="off"
          />
          <Field
            label="Site geofence, in metres"
            type="number"
            inputMode="numeric"
            min={SITE_RADIUS.min}
            max={SITE_RADIUS.max}
            value={site.radiusM}
            onChange={(event) => set({ radiusM: Number(event.target.value) })}
          />
        </div>
        <p className="-mt-3 text-xs text-ink-muted">Picking an address puts the pin there. Drag it, or click the map, to put it right. The geofence is the area the whole site covers; each access point gets its own smaller one in the next step.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Parking</legend>
          <div className="flex flex-wrap gap-2">
            <Choice on={site.openParking} label="Open parking" onPick={() => set({ openParking: true })} />
            <Choice on={!site.openParking} label="Managed, with a set number of spaces" onPick={() => set({ openParking: false })} />
          </div>
          {!site.openParking ? (
            <div className="max-w-56">
              <Field
                label="Parking spaces"
                type="number"
                inputMode="numeric"
                min={1}
                value={site.parkingSpaces}
                onChange={(event) => set({ parkingSpaces: event.target.value.replace(/\D/g, "") })}
              />
            </div>
          ) : null}
        </fieldset>
      </div>
    </Card>
  );
}

function SummaryStep({ site, points }: { site: SiteDraft; points: readonly AccessPointDraft[] }) {
  const booms = points.flatMap((point) => (point.lanes.includes("vehicle") ? point.booms : []));
  const manualBooms = booms.filter((boom) => boom === "manual").length;
  const cameras = points.reduce((sum, point) => sum + point.cctvCameras, 0);
  const withAnpr = points.filter((point) => point.anpr).length;
  const totals = [
    `${points.length} access point${points.length === 1 ? "" : "s"}`,
    `${booms.length} boom${booms.length === 1 ? "" : "s"}${manualBooms ? `, ${manualBooms} manual` : ""}`,
    `${cameras} camera${cameras === 1 ? "" : "s"}`,
    `${withAnpr} of ${points.length} with ANPR`,
    `${points.filter((point) => !point.manned).length} unmanned`,
  ];
  return (
    <Card title="Check and create" subtitle="This is what will be set up. Go back to change anything.">
      <div className="rounded-md bg-surface-muted p-4">
        <p className="font-display text-lg font-semibold">{[site.name, site.code].filter(Boolean).join(" · ")}</p>
        <p className="text-sm text-ink-muted">
          {[SITE_TYPES[site.siteType], site.address || "No address", parseLocation(site.location) ? `Geofence ${site.radiusM} m` : "No geofence yet", site.openParking ? "Open parking" : `${site.parkingSpaces} parking spaces`].join(" · ")}
        </p>
        <p className="mt-2 text-sm font-medium">{totals.join(" · ")}</p>
      </div>
      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
        {points.map((point, index) => (
          <li key={`point-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{`${index + 1}. ${point.label}`}</span>
              <span className="block text-sm text-ink-muted">
                {[GATE_TYPES[point.gateType], lanesLine(point.lanes), point.lanes.includes("vehicle") ? boomsLine(point.booms) : null, point.manned ? "Manned" : "Unmanned", camerasLine(point.cctvCameras, point.anpr), parseLocation(point.location) ? `Geofence ${point.radiusM} m` : "No geofence yet"]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {point.anpr ? <StatusChip status="clear" label="ANPR" /> : <StatusChip status="blocked" label={point.cctvCameras ? "No ANPR" : "No CCTV"} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** `placeId` finishes a place added before sites and clients were one, which has a name but no site yet. */
type Props = { orgId: string; placeId: string | null; initialName: string; initialType?: "hospital" | "estate"; licenceRequestId?: string | null; cancelHref: string };

/** A new site in three steps: the site, then each access point on its own, then a summary to confirm. Nothing saves until the end. */
export function SiteWizard({ orgId, placeId, initialName, initialType = "hospital", licenceRequestId = null, cancelHref }: Props) {
  const [step, setStep] = useState(0);
  const [site, setSite] = useState<SiteDraft>({ name: initialName, siteType: initialType, code: "", address: "", location: "", radiusM: 300, openParking: true, parkingSpaces: "" });
  const [points, setPoints] = useState<AccessPointDraft[]>([{ ...NEW_ACCESS_POINT, label: "Main Gate" }]);
  const [current, setCurrent] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const setCount = (count: number) => {
    setPoints((existing) => Array.from({ length: count }, (_, index) => existing[index] ?? { ...NEW_ACCESS_POINT, label: `Access point ${index + 1}` }));
    setCurrent((at) => Math.min(at, count - 1));
  };
  const point = points[current] ?? NEW_ACCESS_POINT;
  const parsedPlace = parseLocation(site.location);
  // Where the access point maps start, so the gates are found near the site rather than across the country.
  const sitePlace = parsedPlace && parsedPlace !== "invalid" ? parsedPlace : null;
  const updatePoint = (next: AccessPointDraft) => setPoints((existing) => existing.map((item, index) => (index === current ? next : item)));

  const next = () => {
    const found =
      step === 0
        ? siteProblem(site)
        : (points.map((item, index) => {
            const issue = accessPointProblem(item);
            return issue ? `Access point ${index + 1}: ${issue}` : null;
          }).find(Boolean) ?? null);
    setProblem(found);
    if (found) {
      if (step === 1) setCurrent(points.findIndex((item) => accessPointProblem(item) !== null));
      return;
    }
    setStep(step + 1);
  };
  const back = () => {
    setProblem(null);
    setStep(Math.max(0, step - 1));
  };
  const create = () => {
    setProblem(null);
    startSaving(async () => {
      const result = await createSite({ orgId, placeId, licenceRequestId, site, accessPoints: points });
      if (result) setProblem(result.problem);
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className="flex flex-col gap-2">
            <span className={`h-1.5 rounded-pill ${index <= step ? "bg-brand" : "bg-surface-muted"}`} />
            <span className={`text-sm ${index === step ? "font-semibold text-ink" : "text-ink-muted"}`}>{`${index + 1}. ${label}`}</span>
          </li>
        ))}
      </ol>

      <FormProblem message={problem} />

      {step === 0 ? <SiteStep site={site} onChange={setSite} /> : null}

      {step === 1 ? (
        <>
          <Card title="How many access points?" subtitle="Every gate a guard stands at, for vehicles, pedestrians, contractors or services.">
            <Stepper value={points.length} min={1} max={MAX_ACCESS_POINTS} onChange={setCount} label="access point" />
          </Card>
          <section className="dg-glass">
            <div className="flex flex-wrap gap-2 border-b border-border p-4" role="tablist" aria-label="Access points">
              {points.map((item, index) => (
                <button
                  key={`tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={index === current}
                  onClick={() => setCurrent(index)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-sm font-semibold transition ${index === current ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
                >
                  {accessPointProblem(item) ? null : <Icon name="check" className="size-3.5" />}
                  {item.label.trim() || `Access point ${index + 1}`}
                </button>
              ))}
            </div>
            <div className="p-6">
              <p className="mb-4 text-xs font-semibold text-ink-subtle">{`Access point ${current + 1} of ${points.length}`}</p>
              <AccessPointEditor value={point} onChange={updatePoint} near={sitePlace} />
              {points.length > 1 ? (
                <div className="mt-6 flex justify-between">
                  <button type="button" className={QUIET} disabled={current === 0} onClick={() => setCurrent(current - 1)}>
                    Previous access point
                  </button>
                  <button type="button" className={QUIET} disabled={current === points.length - 1} onClick={() => setCurrent(current + 1)}>
                    Next access point
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {step === 2 ? <SummaryStep site={site} points={points} /> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {step === 0 ? (
          <Link href={cancelHref} className={QUIET}>
            Cancel
          </Link>
        ) : (
          <button type="button" className={QUIET} onClick={back}>
            Back
          </button>
        )}
        {step < 2 ? (
          <button type="button" className={MAIN} onClick={next}>
            {step === 0 ? "Next: access points" : "Next: check"}
          </button>
        ) : (
          <button type="button" className={MAIN} onClick={create} disabled={saving}>
            {saving ? "Creating…" : "Create site"}
          </button>
        )}
      </div>
    </div>
  );
}
