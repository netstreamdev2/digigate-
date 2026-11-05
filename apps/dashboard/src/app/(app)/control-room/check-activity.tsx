"use client";

import { describeOccupants, isExpired, normaliseIdentifier, occupantChange, plateDifferences, ruleTitle, type OccupantsBySex } from "@digigate/core";
import Image from "next/image";
import { useRef, useState, useTransition, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ActivityRow } from "@/components/activity-table";
import { CancelButton, Dialog, useDialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { StatusChip } from "@/components/status-chip";
import type { CheckDetail } from "@/lib/check-detail";
import { duration, labelFor, shortDate, timeOfDay } from "@/lib/format";

import { openCheck, openLicencePhoto, openPlatePhoto } from "./actions";

/** `resultLabel` replaces the chip's word, as when a supervisor let a blocked check through. */
export type CheckRow = ActivityRow & { alerts: string[]; resultLabel: string | null };

const SAST_OFFSET_MINUTES = 120;
const HOVER_CARD_WIDTH = 320;
const HOVER_GAP = 8;
const PHOTO_WIDTH = 240;
const PHOTO_HEIGHT = 300;
const PLATE_PHOTO_WIDTH = 960;
const PLATE_PHOTO_HEIGHT = 720;
const NO_VALUE = "—";
/** A photo that hasn't arrived after a day isn't coming: the handheld sends it on its next sync. */
const PHOTO_WAIT_MS = 24 * 60 * 60_000;

const columns = ["Time", "Result", "Person", "Movement", "Vehicle", "Gate", "On site"];

/** Placed from the viewport's top below the row, or from its bottom above the row. */
type Hover = { row: CheckRow; left: number } & ({ top: number; bottom?: never } | { bottom: number; top?: never });

/** About the card's height, for deciding whether it fits below the row. */
const HOVER_CARD_ROOM = 260;

/**
 * A quick look that follows the row under the pointer. Never the only way in: a click or Enter opens the full details.
 * Drawn at the top of the page, not inside the table: a frosted panel, or one still settling into place, would carry a
 * fixed position along with it and put the card at the bottom of the panel instead of beside the row.
 */
function HoverCard({ hover }: { hover: Hover }) {
  const { row } = hover;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-30 rounded-lg border border-border bg-surface p-4 text-sm shadow-floating"
      style={{ top: hover.top, bottom: hover.bottom, left: hover.left, width: HOVER_CARD_WIDTH }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.person}</p>
          <p className="text-xs text-ink-muted">{`${row.direction === "in" ? "Came in" : "Went out"} at ${row.time} · ${row.gate}`}</p>
        </div>
        <StatusChip status={row.result} label={row.resultLabel ?? undefined} />
      </div>
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-ink-subtle">Visiting as</dt>
        <dd>{row.visitType}</dd>
        <dt className="text-ink-subtle">Vehicle</dt>
        <dd>{row.vehicle}</dd>
        <dt className="text-ink-subtle">Plate</dt>
        <dd className="tabular-nums">{row.plate}</dd>
        <dt className="text-ink-subtle">On site</dt>
        <dd>{row.stay}</dd>
      </dl>
      {row.alerts.length > 0 ? <p className="mt-3 text-xs font-semibold text-warning">{row.alerts.join(" · ")}</p> : null}
      <p className="mt-3 border-t border-border pt-2 text-xs text-ink-muted">Click for the photos and everything scanned.</p>
    </div>,
    document.body,
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

function Expiry({ on, at }: { on: string | null; at: number }) {
  if (!on) return <>{NO_VALUE}</>;
  const expired = isExpired(on, at, SAST_OFFSET_MINUTES);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{on}</span>
      {expired ? <StatusChip status="warning" label="Expired" /> : null}
    </span>
  );
}

type PhotoLink = { url: string | null; problem: string | null };
type Loaded = { detail: CheckDetail | null; problem: string | null; photo: PhotoLink | null; plate: PhotoLink | null; at: number };

function LicencePhoto({ loaded, name }: { loaded: Loaded; name: string }) {
  const { detail, photo } = loaded;
  const caption = !detail
    ? null
    : detail.person.typed
      ? "Typed in by hand, so there's no licence photo."
      : !detail.inFull
        ? "Older than a year, so the photo is no longer shown."
        : !detail.hasLicencePhoto
          ? detail.lane === "vehicle"
            ? loaded.at - new Date(detail.occurredAt).getTime() > PHOTO_WAIT_MS
              ? "No licence photo was kept with this check."
              : "No licence photo yet. The handheld sends it when it has a connection."
            : "No licence photo: this person showed an ID document."
          : (photo?.problem ?? "From the licence barcode. Every look is logged.");
  return (
    <figure className="flex flex-col gap-2">
      <div className="grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-md bg-surface-muted ring-1 ring-border">
        {photo?.url ? (
          <Image unoptimized src={photo.url} alt={`${name}, from their driving licence`} width={PHOTO_WIDTH} height={PHOTO_HEIGHT} className="size-full object-cover" />
        ) : (
          <Icon name="people" className="size-1/3 text-ink-subtle" />
        )}
      </div>
      {caption ? <figcaption className="text-xs text-ink-muted">{caption}</figcaption> : null}
    </figure>
  );
}

/** The plate the guard gave, with every character that isn't on the disc boxed, so a one-letter slip stands out. */
export function GivenPlate({ plate, disc }: { plate: string; disc: string | null }) {
  const differs = disc !== null && normaliseIdentifier(plate) !== normaliseIdentifier(disc);
  const characters = differs ? plateDifferences(plate, disc) : null;
  if (!characters) return <span className={`tabular-nums ${differs ? "text-blocked" : ""}`}>{plate}</span>;
  return (
    <span className="inline-flex gap-px tabular-nums" aria-label={`${plate}, which differs from the disc`}>
      {characters.map((character, index) => (
        <span key={index} className={character.differs ? "rounded-sm bg-blocked-soft px-0.5 font-bold text-blocked ring-1 ring-blocked" : "px-px"}>
          {character.character}
        </span>
      ))}
    </span>
  );
}

/** Who was in the car, in words, when the guard counted them by sex; otherwise just how many. */
function peopleIn(total: number | null, bySex: OccupantsBySex | null): string {
  if (bySex) return `${total ?? ""} (${describeOccupants(bySex)})`.trim();
  return total === null ? NO_VALUE : String(total);
}

/** A car that left with a different number of people than came in: noted, never an alarm, with the guard's reason. */
function HeadCountNote({ detail }: { detail: CheckDetail }) {
  if (detail.direction !== "out" || detail.occupantsCameIn === null || detail.occupants === null) return null;
  const change = occupantChange(detail.occupantsCameIn, detail.occupants);
  if (!change) return null;
  return (
    <div role="note" className="mt-3 flex items-start gap-2.5 rounded-md bg-tile-butter px-3 py-2.5 text-sm">
      <Icon name="occupants" className="mt-0.5 size-4 shrink-0 text-ink" />
      <div className="min-w-0">
        <p className="font-semibold">{change === "fewer" ? "Fewer people left than came in" : "More people left than came in"}</p>
        <p className="mt-0.5 text-ink-muted">
          {`Came in: ${peopleIn(detail.occupantsCameIn, detail.occupantsCameInBySex)}. Left: ${peopleIn(detail.occupants, detail.occupantsBySex)}.`}
        </p>
        <p className="mt-0.5 text-ink-muted">{detail.occupantReason ? `The guard said: ${detail.occupantReason}.` : "The guard gave no reason. It was noted, not alarmed."}</p>
      </div>
    </div>
  );
}

/** The stay recorded at entry, and whether the visit kept to it. */
function stayWords(detail: CheckDetail, now: number): string {
  if (!detail.expectedUntil) return detail.direction === "in" && detail.expectedStayMinutes === null ? "No limit" : NO_VALUE;
  const ended = detail.exitedAt ? new Date(detail.exitedAt).getTime() : now;
  const due = new Date(detail.expectedUntil).getTime();
  const until = `Until ${timeOfDay(detail.expectedUntil)}`;
  return ended > due ? `${until} · over by ${duration(due, ended)}` : until;
}

/** How the guard gave the plate, in a sentence, for checks made since plate photos began. */
function plateStory(detail: CheckDetail): string | null {
  const entry = detail.plateEntry;
  if (!entry) return null;
  const disc = detail.vehicle?.plate ?? null;
  const matchesDisc = disc !== null && detail.typedPlate !== null && normaliseIdentifier(disc) === normaliseIdentifier(detail.typedPlate);
  if (entry.warnedPlate) {
    return matchesDisc
      ? `First given as ${entry.warnedPlate}. The guard was told it didn't match the disc, looked again and fixed it.`
      : "The guard was told this plate didn't match the disc, looked again and kept it.";
  }
  if (entry.source === "photo") return "Read off the plate photo and confirmed by the guard.";
  if (entry.photo) return entry.readFromPhoto ? `Typed by the guard. The photo read ${entry.readFromPhoto}.` : "Typed by the guard. The photo couldn't be read.";
  return "Typed by the guard, with no photo.";
}

/** The photo of the car's plate: small beside the vehicle's details, the full width of the popup when clicked. */
function PlatePhoto({ loaded }: { loaded: Loaded }) {
  const [large, setLarge] = useState(false);
  const { detail, plate } = loaded;
  if (!detail?.hasPlatePhoto) {
    const waiting = detail?.inFull && detail.plateEntry?.photo;
    return (
      <figure className="flex w-40 flex-col gap-2">
        <span className="grid aspect-[4/3] w-full place-items-center rounded-md bg-tile-sky text-brand">
          <Icon name="number-plate" className="size-10" />
        </span>
        <figcaption className="text-xs text-ink-muted">
          {waiting ? "The plate photo hasn't arrived yet. The handheld sends it when it has a connection." : detail?.inFull ? "No plate photo with this check." : "Older than a year, so the photo is no longer shown."}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className={`flex flex-col gap-2 ${large ? "basis-full" : "w-40"}`}>
      <button
        type="button"
        onClick={() => setLarge(!large)}
        aria-label={large ? "Make the plate photo smaller" : "Make the plate photo bigger"}
        className="grid aspect-[4/3] w-full cursor-zoom-in place-items-center overflow-hidden rounded-md bg-surface-muted ring-1 ring-border transition hover:ring-brand"
      >
        {plate?.url ? (
          <Image unoptimized src={plate.url} alt="The car's number plate, photographed at the gate" width={PLATE_PHOTO_WIDTH} height={PLATE_PHOTO_HEIGHT} className="size-full object-cover" />
        ) : (
          <Icon name="number-plate" className="size-10 text-ink-subtle" />
        )}
      </button>
      <figcaption className="text-xs text-ink-muted">{plate?.problem ?? (plate ? "Taken at the gate. Every look is logged." : "Opening the photo…")}</figcaption>
    </figure>
  );
}

function CheckDetails({ row, loaded }: { row: CheckRow; loaded: Loaded }) {
  const { detail, at } = loaded;
  if (!detail) return <p className="py-10 text-center text-sm text-ink-muted">{loaded.problem}</p>;
  const name = detail.person.name ?? row.person;
  const vehicle = detail.vehicle;
  const makeModel = [vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
  const story = plateStory(detail);

  return (
    <div className="mt-5 grid gap-6 md:grid-cols-[15rem_1fr]">
      <LicencePhoto loaded={loaded} name={name} />
      <div className="flex min-w-0 flex-col gap-6">
        {detail.ruleCodes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {detail.ruleCodes.map((code) => (
              <span key={code} className="rounded-pill bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
                {ruleTitle(code)}
              </span>
            ))}
          </div>
        ) : null}
        {detail.hotlist ? (
          <div role="note" className="rounded-md bg-blocked-soft px-4 py-3 text-sm">
            <p className="font-semibold text-blocked">{`On the hotlist: ${detail.hotlist.label}${detail.hotlist.removed ? " (since taken off)" : ""}`}</p>
            <p className="mt-1 text-ink">{detail.hotlist.reason}</p>
            <p className="mt-1 text-ink-muted">{`The guard was told: ${detail.hotlist.guardNote}`}</p>
          </div>
        ) : null}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{detail.lane === "vehicle" ? "Driver" : "Person"}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label="Name">{name}</Fact>
            {detail.lane === "vehicle" ? (
              <>
                <Fact label="Licence expires">
                  <Expiry on={detail.person.licenceExpiresOn} at={at} />
                </Fact>
                <Fact label="May drive">{detail.person.vehicleCodes.length ? detail.person.vehicleCodes.join(", ") : NO_VALUE}</Fact>
              </>
            ) : null}
            <Fact label="Visiting as">{detail.visitType ? labelFor(detail.visitType) : NO_VALUE}</Fact>
            {detail.person.typed ? <Fact label="Details">Typed in by the guard</Fact> : null}
          </dl>
        </section>

        {vehicle ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Vehicle</h3>
            <div className="mt-2 flex flex-wrap items-start gap-5">
              <PlatePhoto loaded={loaded} />
              <dl className="grid min-w-[16rem] flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Fact label="Make and model">{makeModel || NO_VALUE}</Fact>
                <Fact label="Colour">{vehicle.colour ?? NO_VALUE}</Fact>
                <Fact label="Body">{vehicle.description ? vehicle.description.split(" / ")[0] : NO_VALUE}</Fact>
                <Fact label="Plate on the disc">
                  <span className="tabular-nums">{vehicle.plate ?? NO_VALUE}</span>
                </Fact>
                <Fact label="Plate the guard saw">{detail.typedPlate ? <GivenPlate plate={detail.typedPlate} disc={vehicle.plate} /> : NO_VALUE}</Fact>
                <Fact label="Disc expires">
                  <Expiry on={vehicle.discExpiresOn} at={at} />
                </Fact>
                <Fact label="People in it">{peopleIn(detail.occupants, detail.occupantsBySex)}</Fact>
                <Fact label="Expected stay">{stayWords(detail, at)}</Fact>
              </dl>
            </div>
            <HeadCountNote detail={detail} />
            {story ? (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                <Icon name="number-plate" className="mt-0.5 size-4 shrink-0" />
                {story}
              </p>
            ) : null}
          </section>
        ) : null}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">At the gate</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label={detail.direction === "in" ? "Came in" : "Went out"}>{`${shortDate(detail.occurredAt)}, ${timeOfDay(detail.occurredAt)}`}</Fact>
            <Fact label="Access point">{row.gate}</Fact>
            {detail.guard ? <Fact label="Scanned by">{detail.guard}</Fact> : null}
            <Fact label="On site">{row.stay}</Fact>
          </dl>
        </section>
      </div>
    </div>
  );
}

/**
 * The live list of checks. Hovering a row shows who it was at a glance; clicking it, or Enter, opens everything that
 * was scanned, with the photo from the driver's licence.
 */
export function CheckActivity({ rows }: { rows: readonly CheckRow[] }) {
  const dialog = useDialog();
  const [hover, setHover] = useState<Hover | null>(null);
  const [open, setOpen] = useState<CheckRow | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, startLoading] = useTransition();
  const opened = useRef<string | null>(null);

  const showHover = (row: CheckRow, event: MouseEvent<HTMLTableRowElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const left = Math.min(Math.max(HOVER_GAP, box.left + 160), window.innerWidth - HOVER_CARD_WIDTH - HOVER_GAP);
    // Near the bottom of the screen the card opens above the row, so it's never cut off.
    const roomBelow = window.innerHeight - box.bottom > HOVER_CARD_ROOM;
    setHover(roomBelow ? { row, left, top: box.bottom + HOVER_GAP } : { row, left, bottom: window.innerHeight - box.top + HOVER_GAP });
  };

  const openRow = (row: CheckRow) => {
    setHover(null);
    setOpen(row);
    setLoaded(null);
    opened.current = row.id;
    dialog.open();
    startLoading(async () => {
      const at = Date.now();
      const { detail, problem } = await openCheck(row.id);
      if (opened.current !== row.id) return;
      setLoaded({ detail, problem, photo: null, plate: null, at });
      if (!detail?.hasLicencePhoto && !detail?.hasPlatePhoto) return;
      const [photo, plate] = await Promise.all([
        detail.hasLicencePhoto ? openLicencePhoto(row.id) : null,
        detail.hasPlatePhoto ? openPlatePhoto(row.id) : null,
      ]);
      if (opened.current === row.id) setLoaded({ detail, problem, photo, plate, at });
    });
  };

  const onKey = (row: CheckRow) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(row);
    }
  };

  return (
    <>
      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              {columns.map((column) => (
                <th key={column} scope="col" className="pb-3 pr-4 font-semibold last:pr-0">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                aria-label={`${row.person}, ${row.direction === "in" ? "in" : "out"} at ${row.time}. Open the details.`}
                onClick={() => openRow(row)}
                onKeyDown={onKey(row)}
                onMouseEnter={(event) => showHover(row, event)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer outline-none transition-colors hover:bg-surface-muted/60 focus-visible:bg-tile-sky"
              >
                <td className="py-3 pr-4 tabular-nums text-ink-muted">{row.time}</td>
                <td className="py-3 pr-4">
                  <StatusChip status={row.result} label={row.resultLabel ?? undefined} />
                </td>
                <td className="py-3 pr-4">
                  <p className="font-medium">{row.person}</p>
                  <p className="text-xs text-ink-muted">{row.visitType}</p>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 text-xs font-semibold">
                    <Icon name={row.direction === "in" ? "entry" : "exit"} className="size-4" />
                    {row.direction === "in" ? "In" : "Out"}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <p>{row.vehicle}</p>
                  <p className="text-xs tabular-nums text-ink-muted">{row.plate}</p>
                </td>
                <td className="py-3 pr-4 text-ink-muted">{row.gate}</td>
                <td className="py-3 tabular-nums text-ink-muted">{row.stay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hover ? <HoverCard hover={hover} /> : null}

      <Dialog
        dialogRef={dialog.ref}
        wide
        onClose={() => {
          opened.current = null;
          setOpen(null);
          setLoaded(null);
        }}
      >
        {open ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-tile-sky text-brand">
                  <Icon name={open.direction === "in" ? "entry" : "exit"} className="size-6" />
                </span>
                <div className="min-w-0 self-center">
                  <h2 className="font-display text-xl font-bold tracking-tight">{loaded?.detail?.person.name ?? open.person}</h2>
                  <p className="text-sm text-ink-muted">{`${open.direction === "in" ? "Came in" : "Went out"} at ${open.time} · ${open.gate}`}</p>
                </div>
              </div>
              <StatusChip status={open.result} label={open.resultLabel ?? undefined} />
            </div>
            {loaded ? <CheckDetails row={open} loaded={loaded} /> : <p className="py-10 text-center text-sm text-ink-muted">{loading ? "Opening…" : null}</p>}
            <div className="mt-6 flex justify-end">
              <CancelButton onClick={dialog.close} label="Close" />
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
