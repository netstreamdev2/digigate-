"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { CompanyMark } from "@/components/company-mark";
import { FormDialog } from "@/components/form-dialog";
import type { CompanyBrand } from "@/lib/company-brand";
import { accentOf, isBrandColor } from "@/lib/company-theme";
import { prepareLogo } from "@/lib/logo-image";

import { saveCompanyBrand } from "../brand-actions";

const PICKER_START = "#062c65";

function LookFields({ company }: { company: CompanyBrand }) {
  const sent = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(company.logoUrl);
  const [color, setColor] = useState(company.color ?? "");
  const [removed, setRemoved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // A picked logo's preview is a link into the browser's memory, let go of once it's replaced.
  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !sent.current) return;
    setWorking(true);
    setProblem(null);
    try {
      const logo = await prepareLogo(file);
      const kept = new File([logo.blob], logo.type === "image/webp" ? "logo.webp" : "logo.png", { type: logo.type });
      const files = new DataTransfer();
      files.items.add(kept);
      sent.current.files = files.files;
      setPreview(URL.createObjectURL(kept));
      setRemoved(false);
      if (logo.color) setColor(logo.color);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That picture couldn't be used.");
    } finally {
      setWorking(false);
    }
  };

  const clearLogo = () => {
    if (sent.current) sent.current.files = new DataTransfer().files;
    setPreview(null);
    setRemoved(true);
  };

  const shown = { ...company, logoUrl: preview, color: color || null };
  const accent = isBrandColor(color) ? accentOf(color) : null;

  return (
    <>
      <input ref={sent} type="file" name="logo" hidden tabIndex={-1} aria-hidden="true" />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="removeLogo" value={removed ? "1" : "0"} />

      <div className="flex flex-wrap items-center gap-5 rounded-lg bg-surface-muted p-5">
        <CompanyMark company={shown} size={84} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="inline-flex h-11 w-fit cursor-pointer items-center rounded-pill bg-surface px-5 text-sm font-semibold shadow-card transition hover:bg-border">
            {working ? "Reading the logo…" : preview ? "Pick another logo" : "Pick a logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} disabled={working} className="sr-only" />
          </label>
          {preview ? (
            <button type="button" onClick={clearLogo} className="w-fit text-xs font-semibold text-blocked hover:underline">
              Take the logo off
            </button>
          ) : (
            <p className="text-xs text-ink-muted">PNG, JPG, WebP or SVG. It&apos;s made small and square-friendly before it&apos;s sent.</p>
          )}
        </div>
      </div>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-blocked">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="color"
            value={isBrandColor(color) ? color : PICKER_START}
            onChange={(event) => setColor(event.target.value.toLowerCase())}
            className="size-11 cursor-pointer rounded-md border border-border bg-surface p-1"
          />
          The company&apos;s colour
        </label>
        {color ? (
          <button type="button" onClick={() => setColor("")} className="text-xs font-semibold text-ink-muted hover:text-ink hover:underline">
            Use DigiGate&apos;s colours instead
          </button>
        ) : (
          <p className="text-xs text-ink-muted">None yet: pages keep DigiGate&apos;s colours.</p>
        )}
      </div>

      {accent ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
          <p className="w-full text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">How it looks</p>
          <span className="inline-flex h-10 items-center rounded-pill px-4 text-sm font-semibold text-ink-inverse" style={{ background: accent }}>
            A button
          </span>
          <span className="text-sm font-semibold" style={{ color: accent }}>
            A highlighted word
          </span>
          {accent !== color ? <p className="w-full text-xs text-ink-muted">Darkened a little so white writing on it stays easy to read.</p> : null}
        </div>
      ) : null}
    </>
  );
}

/** A company's look on the dashboard: its logo, its colour, and a way to change both. */
export function CompanyLook({ company }: { company: CompanyBrand }) {
  return (
    <section aria-label={`${company.name}'s look`} className="dg-glass mt-6 flex flex-wrap items-center gap-5 p-5">
      <CompanyMark company={company} size={56} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">Logo and colour</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          {company.logoUrl || company.color
            ? "Everyone at this company sees the dashboard in this look."
            : "Add the company's logo and the dashboard takes on its colours for everyone who works there."}
        </p>
      </div>
      {company.color ? <span aria-hidden="true" className="size-8 rounded-pill ring-2 ring-surface shadow-card" style={{ background: company.color }} /> : null}
      <FormDialog
        wide
        label={company.logoUrl ? "Change the look" : "Add a logo"}
        title={`${company.name}'s logo and colour`}
        icon="upload"
        submitLabel="Save the look"
        pendingLabel="Saving…"
        action={saveCompanyBrand}
        fields={{ orgId: company.id }}
      >
        <LookFields company={company} />
      </FormDialog>
    </section>
  );
}
