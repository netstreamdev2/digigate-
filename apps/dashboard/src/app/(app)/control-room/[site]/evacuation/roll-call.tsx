"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CompanyMark } from "@/components/company-mark";
import { Icon } from "@/components/icon";
import type { CompanyBrand } from "@/lib/company-brand";

export type RollCallRow = {
  id: string;
  name: string;
  /** Under the name: the plate and car, or how they came in on foot. */
  detail: string;
  /** People still to see for this row besides the one named: a car's passengers. */
  others: number;
  /** How many of those passengers are children. */
  children: number;
  cameIn: string;
  gate: string;
};

type Section = { title: string; icon: "vehicle" | "pedestrian" | "guard"; rows: readonly RollCallRow[]; empty: string };

type Props = {
  site: string;
  company: CompanyBrand | null;
  generatedAt: string;
  sections: readonly Section[];
  /** Everyone to account for, passengers and gate staff included. */
  headcount: number;
  /** How many of them are children, counted in cars at the gate. */
  childCount: number;
  /** False when the site has more people inside than one list holds. */
  complete: boolean;
};

function Tick({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`grid size-7 shrink-0 place-items-center rounded-md border-2 transition ${checked ? "border-clear bg-clear text-ink-inverse" : "border-ink/25 bg-surface hover:border-ink/50"}`}
    >
      {checked ? <Icon name="check" className="size-4" /> : null}
    </button>
  );
}

/**
 * The marshal's list for an evacuation: everyone inside right now, ticked off as they reach the assembly point. Ticks
 * live in this page only, never on the server, and survive a refresh of the list. It prints as plain A4.
 */
export function RollCall({ site, company, generatedAt, sections, headcount, childCount, complete }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = sections.flatMap((section) => section.rows);
  const accounted = rows.filter((row) => ticked.has(row.id)).reduce((sum, row) => sum + 1 + row.others, 0);
  const share = headcount === 0 ? 1 : accounted / headcount;
  const allClear = headcount > 0 && accounted >= headcount;

  return (
    <div className="dg-sheet mx-auto mt-6 max-w-5xl rounded-xl border border-border bg-surface p-6 shadow-floating sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-ink pb-6">
        <div className="flex items-center gap-4">
          {company ? <CompanyMark company={company} size={56} /> : <Image src="/logo-mark.svg" alt="" width={48} height={48} unoptimized />}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blocked">Evacuation roll call</p>
            <h2 className="font-display text-3xl font-bold tracking-tight">{site}</h2>
            <p className="text-sm text-ink-muted">{`Everyone inside at ${generatedAt}${company ? ` · ${company.name}` : ""}`}</p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-surface-muted px-4 text-sm font-semibold transition hover:bg-border"
          >
            <Icon name="refresh" className="size-4" />
            {refreshing ? "Refreshing…" : "Refresh the list"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-blocked px-5 text-sm font-semibold text-ink-inverse shadow-floating transition hover:bg-ink"
          >
            <Icon name="download" className="size-4" />
            Print the list
          </button>
        </div>
      </header>

      <section aria-label="Head count" className="mt-6 grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="rounded-lg bg-ink px-5 py-4 text-ink-inverse">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-inverse/70">To account for</p>
          <p className="font-display text-5xl font-bold tabular-nums tracking-tight">{headcount}</p>
          <p className="text-xs text-ink-inverse/70">
            {childCount ? `People inside, passengers and gate staff included: ${childCount === 1 ? "1 is a child" : `${childCount} are children`}` : "People inside, passengers and gate staff included"}
          </p>
        </div>
        <div className={`rounded-lg px-5 py-4 ${allClear ? "bg-clear-soft" : "bg-surface-muted"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Accounted for</p>
            {allClear ? (
              <p className="flex items-center gap-1.5 text-sm font-bold text-clear">
                <Icon name="result-clear" className="size-5" />
                Everyone is out
              </p>
            ) : null}
          </div>
          <p className="font-display text-5xl font-bold tabular-nums tracking-tight">
            {accounted}
            <span className="text-2xl text-ink-subtle">{` of ${headcount}`}</span>
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-pill bg-ink/10" aria-hidden="true">
            <div className={`h-full rounded-pill transition-[width] duration-500 ${allClear ? "bg-clear" : "bg-warning"}`} style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
        </div>
      </section>

      {complete ? null : (
        <p role="alert" className="mt-4 rounded-md bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          More people are inside than one list can hold. Print it by gate from the control room as well.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h3 className="flex items-center gap-2 border-b border-border pb-2 font-display text-lg font-semibold tracking-tight">
            <Icon name={section.icon} className="size-5 text-ink-muted" />
            {section.title}
            <span className="text-ink-subtle">{section.rows.length}</span>
          </h3>
          {section.rows.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">{section.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-subtle">
                  <th className="w-10 py-2 font-semibold" aria-label="Accounted for" />
                  <th className="py-2 font-semibold">Name</th>
                  <th className="hidden py-2 font-semibold sm:table-cell">Came in</th>
                  <th className="py-2 text-right font-semibold">Gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {section.rows.map((row) => {
                  const done = ticked.has(row.id);
                  return (
                    <tr key={row.id} className={`transition-colors ${done ? "bg-clear-soft/60" : ""}`}>
                      <td className="py-2.5 pr-3 align-top">
                        <Tick checked={done} label={`${row.name} is accounted for`} onToggle={() => toggle(row.id)} />
                      </td>
                      <td className="py-2.5 align-top">
                        <p className={`font-semibold ${done ? "text-ink-muted line-through decoration-clear decoration-2" : ""}`}>{row.name}</p>
                        <p className="text-xs text-ink-muted">
                          {row.detail}
                          {row.others > 0 ? (
                            <span className="font-semibold text-ink">{` · +${row.others} with them${row.children ? `, ${row.children === 1 ? "1 child" : `${row.children} children`}` : ""}`}</span>
                          ) : null}
                        </p>
                      </td>
                      <td className="hidden py-2.5 align-top tabular-nums text-ink-muted sm:table-cell">{row.cameIn}</td>
                      <td className="py-2.5 text-right align-top text-ink-muted">{row.gate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <footer className="mt-10 grid gap-6 border-t-2 border-ink pt-6 text-sm sm:grid-cols-3">
        {["Assembly point", "Marshal's name and signature", "Time everyone was out"].map((label) => (
          <div key={label}>
            <div className="h-8 border-b border-ink/40" />
            <p className="mt-1.5 text-xs text-ink-muted">{label}</p>
          </div>
        ))}
        <p className="text-xs text-ink-subtle sm:col-span-3">
          This list names people. Keep it with the marshal, and shred it once everyone is accounted for.
        </p>
      </footer>
    </div>
  );
}
