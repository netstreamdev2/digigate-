"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { Field } from "@/components/form";
import { Icon } from "@/components/icon";

import { openPlatePhoto } from "./actions";
import { GivenPlate } from "./check-activity";

const PHOTO_WIDTH = 960;
const PHOTO_HEIGHT = 720;

/** The reasons a plate mismatch usually closes with, one tap each. Anything else is typed. */
const QUICK_REASONS = [
  "Guard typo: the plate photo shows the disc's plate",
  "Checked at the car: the plate matches the disc",
  "Plate and disc really differ: reported",
];

type Props = { eventId: string; discPlate: string | null; typedPlate: string | null };

/**
 * Closing a plate mismatch with the evidence in front of you: the plate photo from the gate, opened only when asked
 * (every look is logged), and the plate the guard typed with the slipped characters boxed.
 */
export function PlateEvidence({ eventId, discPlate, typedPlate }: Props) {
  const [photo, setPhoto] = useState<{ url: string | null; problem: string | null } | null>(null);
  const [opening, startOpening] = useTransition();
  const [reason, setReason] = useState("");

  return (
    <>
      <div className="flex flex-col gap-3 rounded-md bg-surface-muted p-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-ink-subtle">On the disc</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{discPlate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-subtle">The guard gave</dt>
            <dd className="mt-0.5 font-semibold">{typedPlate ? <GivenPlate plate={typedPlate} disc={discPlate} /> : "—"}</dd>
          </div>
        </dl>
        {photo?.url ? (
          <Image unoptimized src={photo.url} alt="The car's number plate, photographed at the gate" width={PHOTO_WIDTH} height={PHOTO_HEIGHT} className="aspect-[4/3] w-full rounded-md object-cover ring-1 ring-border" />
        ) : (
          <button
            type="button"
            disabled={opening}
            onClick={() => startOpening(async () => setPhoto(await openPlatePhoto(eventId)))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-surface px-4 text-sm font-semibold ring-1 ring-border transition hover:ring-brand disabled:opacity-60"
          >
            <Icon name="number-plate" className="size-4" />
            {opening ? "Opening…" : "Show the plate photo"}
          </button>
        )}
        {photo?.problem ? <p className="text-xs text-ink-muted">{photo.problem}</p> : null}
        {photo?.url ? <p className="text-xs text-ink-muted">Taken at the gate. Every look is logged.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_REASONS.map((quick) => (
          <button
            key={quick}
            type="button"
            onClick={() => setReason(quick)}
            aria-pressed={reason === quick}
            className={`rounded-pill px-3 py-1.5 text-xs font-semibold transition ${reason === quick ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
          >
            {quick}
          </button>
        ))}
      </div>
      <Field label="What was done?" name="reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
    </>
  );
}
