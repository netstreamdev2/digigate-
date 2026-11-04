"use client";

import { cleanIdNumber, maskedIdNumber, PSIRA_GRADES, type IdType } from "@digigate/core";
import { startTransition, useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { ConfirmButton } from "@/components/dialog";
import { Field, FormProblem, SelectField } from "@/components/form";
import { FORM_START } from "@/lib/form-state";

import { revealIdNumber, saveGuardPhoto, saveGuardRecord } from "./actions";
import { IdCard, type IdCardDetails } from "./id-card";

export type GuardRecordView = {
  phone: string;
  homeAddress: string;
  psiraNumber: string;
  psiraGrade: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  idType: IdType | null;
  idLastFour: string | null;
};

type Props = {
  gateUserId: string;
  record: GuardRecordView;
  photoUrl: string | null;
  card: Omit<IdCardDetails, "photoUrl" | "psiraNumber" | "psiraGrade">;
};

const PHOTO_WIDTH = 600;
const PHOTO_HEIGHT = 800;
const PHOTO_QUALITY = 0.85;
const REVEAL_FOR_MS = 30_000;
const ID_TYPES: Record<IdType, string> = { sa_id: "SA ID number", passport: "Passport number" };

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="mt-0.5 text-sm text-ink-muted">{hint}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * The picture cut to a 3:4 portrait and made small before it leaves the browser. Drawing it afresh also drops
 * everything the camera wrote into the file, such as where it was taken.
 */
async function portraitOf(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const target = PHOTO_WIDTH / PHOTO_HEIGHT;
  const width = Math.min(bitmap.width, bitmap.height * target);
  const height = width / target;
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_WIDTH;
  canvas.height = PHOTO_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No drawing surface");
  context.drawImage(bitmap, (bitmap.width - width) / 2, (bitmap.height - height) / 2, width, height, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function PhotoPicker({ gateUserId, onSaved }: { gateUserId: string; onSaved: (url: string) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    setSaving(true);
    try {
      const result = await saveGuardPhoto(gateUserId, await portraitOf(file));
      if (result.photoUrl) onSaved(result.photoUrl);
      else setProblem(result.problem);
    } catch {
      setProblem("That picture couldn't be read. Choose a JPEG or PNG photo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={choose} aria-label="Choose an employee photo" />
      <button
        type="button"
        disabled={saving}
        onClick={() => input.current?.click()}
        className="inline-flex h-11 items-center justify-center self-start rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink disabled:opacity-50"
      >
        {saving ? "Saving the photo…" : "Choose a photo"}
      </button>
      <p className="text-xs text-ink-muted">A clear, front-on picture of their face, like a passport photo. It&apos;s cut to a portrait and saved straight away.</p>
      <FormProblem message={problem} />
    </div>
  );
}

function IdNumberField({ gateUserId, saved, typeChoice, onTypeChoice, number, onNumber }: {
  gateUserId: string;
  saved: { type: IdType; lastFour: string } | null;
  typeChoice: IdType;
  onTypeChoice: (type: IdType) => void;
  number: string;
  onNumber: (next: string) => void;
}) {
  const [changing, setChanging] = useState(saved === null);
  const [shown, setShown] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), REVEAL_FOR_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (saved && !changing) {
    const reveal = async () => {
      setProblem(null);
      const result = await revealIdNumber(gateUserId);
      if (result.idNumber) setShown(result.idNumber);
      else setProblem(result.problem);
    };
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{ID_TYPES[saved.type]}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-base font-semibold tracking-wider">{shown ?? maskedIdNumber(saved.lastFour)}</span>
          {shown ? null : (
            <button type="button" onClick={reveal} className="text-xs font-semibold text-brand hover:underline">
              Show for 30 seconds
            </button>
          )}
          <button type="button" onClick={() => setChanging(true)} className="text-xs font-semibold text-brand hover:underline">
            Change
          </button>
        </div>
        <p className="text-xs text-ink-muted">Kept encrypted. Showing it is logged under your name.</p>
        <FormProblem message={problem} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
      <SelectField label="Document" name="idType" value={typeChoice} onChange={(event) => onTypeChoice(event.target.value === "passport" ? "passport" : "sa_id")}>
        {Object.entries(ID_TYPES).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </SelectField>
      <Field label={ID_TYPES[typeChoice]} name="idNumber" value={number} onChange={(event) => onNumber(event.target.value)} inputMode={typeChoice === "sa_id" ? "numeric" : "text"} autoComplete="off" />
    </div>
  );
}

/** A guard's record and their ID card, side by side. The card changes as the record does. */
export function GuardRecordEditor({ gateUserId, record, photoUrl: initialPhoto, card }: Props) {
  const [state, action, pending] = useActionState(saveGuardRecord, FORM_START);
  const [fields, setFields] = useState(record);
  const [photoUrl, setPhotoUrl] = useState(initialPhoto);
  const [idType, setIdType] = useState<IdType>(record.idType ?? "sa_id");
  const [idNumber, setIdNumber] = useState("");
  const [savedId, setSavedId] = useState(record.idType && record.idLastFour ? { type: record.idType, lastFour: record.idLastFour } : null);
  const pendingId = useRef<{ type: IdType; lastFour: string } | null>(null);

  useEffect(() => {
    if (!state.saved) return;
    if (pendingId.current) setSavedId(pendingId.current);
    pendingId.current = null;
    setIdNumber("");
  }, [state.saved]);

  const set = (name: keyof GuardRecordView) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields((current) => ({ ...current, [name]: event.target.value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = cleanIdNumber(idNumber);
    pendingId.current = cleaned ? { type: idType, lastFour: cleaned.slice(-4) } : null;
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6 lg:sticky lg:top-6">
        <IdCard card={{ ...card, photoUrl, psiraNumber: fields.psiraNumber, psiraGrade: fields.psiraGrade }} />
        <Section title="Employee photo" hint="Shown on their ID card, so a guard can be recognised. Never used for face recognition.">
          <PhotoPicker gateUserId={gateUserId} onSaved={setPhotoUrl} />
        </Section>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <input type="hidden" name="gateUserId" value={gateUserId} />
        <Section title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" name="phone" value={fields.phone} onChange={set("phone")} inputMode="tel" placeholder="082 123 4567" autoComplete="off" />
          </div>
          <Field label="Home address" name="homeAddress" value={fields.homeAddress} onChange={set("homeAddress")} autoComplete="off" />
        </Section>

        <Section title="Identity" hint="Kept encrypted, and shown only by its last four until someone asks to see it.">
          {/* Saving a new number starts this afresh, showing it masked. */}
          <IdNumberField key={savedId ? `${savedId.type}-${savedId.lastFour}` : "none"} gateUserId={gateUserId} saved={savedId} typeChoice={idType} onTypeChoice={setIdType} number={idNumber} onNumber={setIdNumber} />
        </Section>

        <Section title="PSIRA" hint="Their registration with the Private Security Industry Regulatory Authority.">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field label="PSIRA number" name="psiraNumber" value={fields.psiraNumber} onChange={set("psiraNumber")} inputMode="numeric" autoComplete="off" />
            <SelectField label="Grade" name="psiraGrade" value={fields.psiraGrade} onChange={set("psiraGrade")}>
              <option value="">Not known</option>
              {PSIRA_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {`Grade ${grade}`}
                </option>
              ))}
            </SelectField>
          </div>
        </Section>

        <Section title="Next of kin" hint="Who to call if something happens to them on duty.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="nextOfKinName" value={fields.nextOfKinName} onChange={set("nextOfKinName")} autoComplete="off" />
            <Field label="Relationship" name="nextOfKinRelationship" value={fields.nextOfKinRelationship} onChange={set("nextOfKinRelationship")} placeholder="Mother, partner, brother" autoComplete="off" />
            <Field label="Phone" name="nextOfKinPhone" value={fields.nextOfKinPhone} onChange={set("nextOfKinPhone")} inputMode="tel" autoComplete="off" />
          </div>
        </Section>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <FormProblem message={state.problem} />
          {state.saved && !pending ? (
            <p role="status" className="text-sm font-semibold text-clear">
              Saved
            </p>
          ) : null}
          <ConfirmButton label="Save record" pendingLabel="Saving…" tone="neutral" pending={pending} />
        </div>
      </form>
    </div>
  );
}
