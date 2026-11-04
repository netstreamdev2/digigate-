"use client";

import { isExpired, ruleTitle } from "@digigate/core";
import Image from "next/image";
import { useRef, useState, useTransition, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ActivityRow } from "@/components/activity-table";
import { CancelButton, Dialog, useDialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { StatusChip } from "@/components/status-chip";
import type { CheckDetail } from "@/lib/check-detail";
import { labelFor, shortDate, timeOfDay } from "@/lib/format";

import { openCheck, openLicencePhoto } from "./actions";

/** `resultLabel` replaces the chip's word, as when a supervisor let a blocked check through. */
export type CheckRow = ActivityRow & { alerts: string[]; resultLabel: string | null };

const SAST_OFFSET_MINUTES = 120;
const HOVER_CARD_WIDTH = 320;
const HOVER_GAP = 8;
const PHOTO_WIDTH = 240;
const PHOTO_HEIGHT = 300;
const NO_VALUE = "—";

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
      <p className="mt-3 border-t border-border pt-2 text-xs text-ink-muted">Click for the licence photo and everything scanned.</p>
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

type Loaded = { detail: CheckDetail | null; problem: string | null; photo: { url: string | null; problem: string | null } | null; at: number };

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
            ? "No licence photo yet. The handheld sends it when it has a connection."
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

function CheckDetails({ row, loaded }: { row: CheckRow; loaded: Loaded }) {
  const { detail, at } = loaded;
  if (!detail) return <p className="py-10 text-center text-sm text-ink-muted">{loaded.problem}</p>;
  const name = detail.person.name ?? row.person;
  const vehicle = detail.vehicle;
  const makeModel = [vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
  const platesDiffer = vehicle?.plate && detail.typedPlate && vehicle.plate.replace(/[^A-Z0-9]/gi, "") !== detail.typedPlate.replace(/[^A-Z0-9]/gi, "");

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
            <div className="mt-2 flex flex-wrap items-center gap-5">
              <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-tile-sky text-brand">
                <Icon name="vehicle" className="size-8" />
              </span>
              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Fact label="Make and model">{makeModel || NO_VALUE}</Fact>
                <Fact label="Colour">{vehicle.colour ?? NO_VALUE}</Fact>
                <Fact label="Body">{vehicle.description ? vehicle.description.split(" / ")[0] : NO_VALUE}</Fact>
                <Fact label="Plate on the disc">
                  <span className="tabular-nums">{vehicle.plate ?? NO_VALUE}</span>
                </Fact>
                <Fact label="Plate the guard saw">
                  <span className={`tabular-nums ${platesDiffer ? "text-blocked" : ""}`}>{detail.typedPlate ?? NO_VALUE}</span>
                </Fact>
                <Fact label="Disc expires">
                  <Expiry on={vehicle.discExpiresOn} at={at} />
                </Fact>
                <Fact label="People in it">{detail.occupants ?? NO_VALUE}</Fact>
              </dl>
            </div>
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
      setLoaded({ detail, problem, photo: null, at });
      if (!detail?.hasLicencePhoto) return;
      const photo = await openLicencePhoto(row.id);
      if (opened.current === row.id) setLoaded({ detail, problem, photo, at });
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
