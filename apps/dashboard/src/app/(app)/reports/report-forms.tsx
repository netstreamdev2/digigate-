"use client";

import { REPORT_FREQUENCIES, frequencyLabel, type ReportFrequency } from "@digigate/core";
import { useActionState, useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { CancelButton, ConfirmButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";
import { Field, FormProblem, TextAreaField } from "@/components/form";
import { Icon } from "@/components/icon";
import { FORM_START } from "@/lib/form-state";

import { emailPreview, saveSchedule, sendReport } from "./actions";

export type Letter = {
  org: string;
  client: string;
  frequency: ReportFrequency;
  day: string;
  scope: string;
  period: string;
  subject: string;
};

const LOOKS_LIKE_EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const SEPARATORS = /[\s,;]+/;

/** Addresses as chips: type or paste, and a comma, a space or Enter makes each one. */
function RecipientField({ label, name, autoFocus = false }: { label: string; name: string; autoFocus?: boolean }) {
  const inputId = useId();
  const [addresses, setAddresses] = useState<readonly string[]>([]);
  const [text, setText] = useState("");

  const commit = (value: string) => {
    const found = value.split(SEPARATORS).map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (found.length) setAddresses((current) => [...new Set([...current, ...found])]);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === " " || event.key === ";") {
      event.preventDefault();
      commit(text);
    } else if (event.key === "Backspace" && !text) {
      setAddresses((current) => current.slice(0, -1));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={inputId}>{label}</label>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2 transition-shadow focus-within:border-brand focus-within:ring-4 focus-within:ring-tile-sky">
        {addresses.map((address) => {
          const good = LOOKS_LIKE_EMAIL.test(address);
          return (
            <span key={address} className={`inline-flex h-7 max-w-full items-center gap-1 rounded-pill pl-2.5 pr-1 text-xs font-medium ${good ? "bg-tile-sky text-brand" : "bg-blocked-soft text-blocked"}`}>
              <span className="truncate">{address}</span>
              <button type="button" aria-label={`Remove ${address}`} onClick={() => setAddresses((current) => current.filter((item) => item !== address))} className="grid size-5 shrink-0 place-items-center rounded-pill hover:bg-ink/10">
                <Icon name="close" className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          id={inputId}
          data-recipients={name}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(text)}
          onPaste={(event) => {
            event.preventDefault();
            commit(`${text} ${event.clipboardData.getData("text")}`);
          }}
          placeholder={addresses.length ? "" : "name@company.co.za"}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm font-normal outline-none placeholder:text-ink-subtle"
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(addresses)} />
    </div>
  );
}

function Recipients({ autoFocus = false }: { autoFocus?: boolean }) {
  const [copies, setCopies] = useState(false);
  return (
    <>
      <RecipientField label="To" name="to" autoFocus={autoFocus} />
      {copies ? (
        <>
          <RecipientField label="CC" name="cc" />
          <RecipientField label="BCC" name="bcc" />
        </>
      ) : (
        <button type="button" onClick={() => setCopies(true)} className="self-start text-sm font-semibold text-brand hover:text-ink">
          Add CC or BCC
        </button>
      )}
    </>
  );
}

function ScopeFields({ letter }: { letter: Letter }) {
  return (
    <>
      <input type="hidden" name="org" value={letter.org} />
      <input type="hidden" name="client" value={letter.client} />
      <input type="hidden" name="frequency" value={letter.frequency} />
      <input type="hidden" name="day" value={letter.day} />
    </>
  );
}

const BUTTON = "inline-flex h-11 shrink-0 items-center gap-2 rounded-pill px-4 text-sm font-semibold transition";

/** Writes and sends a report, showing the email exactly as it will arrive. */
export function EmailReportButton({ letter }: { letter: Letter }) {
  const dialog = useDialog();
  const { ref } = dialog;
  const [state, formAction] = useActionState(sendReport, FORM_START);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const message = useRef("");

  useEffect(() => {
    if (state.saved) ref.current?.close();
  }, [ref, state.saved]);

  const refreshPreview = () => {
    startLoading(async () => {
      const result = await emailPreview({ org: letter.org, client: letter.client, frequency: letter.frequency, day: letter.day, message: message.current });
      setPreview(result);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.open();
          refreshPreview();
        }}
        className={`${BUTTON} bg-brand text-ink-inverse hover:bg-ink`}
      >
        <Icon name="export" className="size-4" />
        Email report
      </button>
      {state.saved ? <span role="status" className="text-sm font-semibold text-clear">Sent</span> : null}

      <Dialog dialogRef={dialog.ref} wide>
        <DialogHeading icon="export" tone="neutral" title={`Email the ${letter.frequency} report`} />
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <form key={state.saved} action={formAction} className="flex min-w-0 flex-col gap-4">
            <FormProblem message={state.problem} />
            <ScopeFields letter={letter} />
            <Recipients autoFocus />
            <Field label="Subject" name="subject" defaultValue={letter.subject} maxLength={200} required />
            <TextAreaField
              label="Message"
              name="message"
              rows={5}
              maxLength={4000}
              placeholder="Leave this empty for a short standard note."
              onChange={(event) => {
                message.current = event.target.value;
              }}
              onBlur={refreshPreview}
            />
            <p className="flex items-center gap-2 rounded-md bg-tile-sky px-3 py-2.5 text-xs font-medium text-brand">
              <Icon name="reports" className="size-4 shrink-0" />
              The full report is attached as a PDF. It holds counts only: no names, ID numbers or plates.
            </p>
            <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <CancelButton onClick={dialog.close} />
              <ConfirmButton label="Send report" pendingLabel="Sending…" tone="neutral" />
            </div>
          </form>

          <div className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
            <p>{loading ? "Updating preview…" : "How it will look"}</p>
            <div className="h-[30rem] overflow-hidden rounded-md border border-border bg-surface-muted">
              {preview ? <iframe title="Email preview" sandbox="" srcDoc={preview} className="size-full" /> : <p className="grid h-full place-items-center px-6 text-center text-sm font-normal text-ink-muted">Preparing the preview…</p>}
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

const WHEN: Record<ReportFrequency, string> = {
  daily: "Every day",
  weekly: "Every Monday",
  monthly: "On the 1st of every month",
  quarterly: "On the first day of every quarter",
  yearly: "Every 1 January",
};

const WHAT: Record<ReportFrequency, string> = {
  daily: "the day before",
  weekly: "the week that just ended",
  monthly: "the month that just ended",
  quarterly: "the quarter that just ended",
  yearly: "the year that just ended",
};

/** Sets a report to send itself. It always reports on the period that has just finished. */
export function AutomateButton({ letter }: { letter: Letter }) {
  const dialog = useDialog();
  const { ref } = dialog;
  const [state, formAction] = useActionState(saveSchedule, FORM_START);
  const [frequency, setFrequency] = useState<ReportFrequency>(letter.frequency);
  const [time, setTime] = useState("07:00");

  useEffect(() => {
    if (state.saved) ref.current?.close();
  }, [ref, state.saved]);

  return (
    <>
      <button type="button" onClick={dialog.open} className={`${BUTTON} dg-glass hover:bg-surface`}>
        <Icon name="calendar" className="size-4" />
        Automate
      </button>
      <Dialog dialogRef={dialog.ref}>
        <DialogHeading icon="calendar" tone="neutral" title={`Automate ${letter.scope}'s report`} />
        <form key={state.saved} action={formAction} className="mt-5 flex flex-col gap-4">
          <FormProblem message={state.problem} />
          <ScopeFields letter={{ ...letter, frequency }} />
          <input type="hidden" name="scope" value={letter.scope} />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">How often</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REPORT_FREQUENCIES.map((item) => (
                <label key={item} className={`inline-flex h-9 cursor-pointer items-center rounded-pill px-3.5 text-sm font-semibold transition-colors ${item === frequency ? "bg-ink text-ink-inverse" : "bg-surface-muted hover:bg-border"}`}>
                  <input type="radio" name="how-often" className="sr-only" checked={item === frequency} onChange={() => setFrequency(item)} />
                  {frequencyLabel(item)}
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Send at" name="sendAt" type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
          <p className="rounded-md bg-tile-sky px-3 py-2.5 text-sm font-medium text-brand">{`${WHEN[frequency]} at ${time}, it sends ${WHAT[frequency]}.`}</p>
          <Recipients />
          <TextAreaField label="Message" name="message" rows={3} maxLength={4000} placeholder="Optional. It goes in every email." />

          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <CancelButton onClick={dialog.close} />
            <ConfirmButton label="Automate report" pendingLabel="Saving…" tone="neutral" />
          </div>
        </form>
      </Dialog>
    </>
  );
}
