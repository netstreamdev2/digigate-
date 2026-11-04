"use client";

import { useState } from "react";

import { Icon } from "@/components/icon";

export type IdCardDetails = {
  company: string;
  name: string;
  role: string;
  employeeNumber: string;
  cardNumber: string;
  psiraNumber: string;
  psiraGrade: string;
  sites: string;
  photoUrl: string | null;
  issuedOn: string;
};

// The card is drawn on an 856 by 540 grid, the proportions of a bank card (85.6 by 54 mm).
const WIDTH = 856;
const HEIGHT = 540;

/** Fine wavy lines across the card, the kind of fine-line print that's hard to copy. */
function wavePaths(): string[] {
  return Array.from({ length: 14 }, (_, line) => {
    const base = 40 + line * 36;
    const points = Array.from({ length: 87 }, (_, step) => {
      const x = step * 10;
      const y = base + Math.sin(x / 46 + line * 0.7) * 12 + Math.sin(x / 17 + line) * 3;
      return `${step === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
    });
    return points.join(" ");
  });
}

/** A rosette, as on banknotes and ID cards: one curve turned many times about a point. */
function rosettePaths(cx: number, cy: number, radius: number): string[] {
  return Array.from({ length: 12 }, (_, turn) => {
    const points = Array.from({ length: 181 }, (_, step) => {
      const angle = (step / 180) * Math.PI * 2;
      const r = radius + Math.sin(angle * 9 + turn * 0.52) * radius * 0.16;
      return `${step === 0 ? "M" : "L"}${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r).toFixed(1)}`;
    });
    return `${points.join(" ")} Z`;
  });
}

const WAVES = wavePaths();
const ROSETTE = rosettePaths(690, 300, 150);

function SecurityPrint({ microtext }: { microtext: string }) {
  const line = `${microtext} · `.repeat(14);
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" preserveAspectRatio="none">
      <g fill="none" stroke="var(--color-brand)" strokeWidth="0.8" opacity="0.07">
        {WAVES.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
      <g fill="none" stroke="var(--color-brand)" strokeWidth="0.9" opacity="0.09">
        {ROSETTE.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
      <text x="0" y={HEIGHT - 14} fontSize="7" letterSpacing="1.2" fill="var(--color-ink)" opacity="0.28">
        {line}
      </text>
    </svg>
  );
}

function Photo({ url, className }: { url: string | null; className: string }) {
  if (!url) {
    return (
      <div className={`grid place-items-center bg-tile-sky text-brand ${className}`}>
        <Icon name="guard" className="size-1/2 opacity-60" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a short-lived private link; next/image would cache it past its life.
  return <img src={url} alt="" className={`object-cover ${className}`} />;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.55em] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
      <p className="truncate text-[0.82em] font-semibold text-ink">{value}</p>
    </div>
  );
}

function Front({ card }: { card: IdCardDetails }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[0.9em] border border-border bg-surface shadow-floating [backface-visibility:hidden]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,var(--color-tile-lilac),transparent_55%),radial-gradient(circle_at_0%_100%,var(--color-tile-sky),transparent_50%)] opacity-60" />
      <SecurityPrint microtext={`${card.company.toUpperCase()} · ${card.cardNumber}`} />

      <div className="relative flex h-[19%] items-center justify-between bg-brand px-[5%] text-ink-inverse">
        <div className="min-w-0">
          <p className="truncate font-display text-[0.95em] font-bold tracking-tight">{card.company}</p>
          <p className="text-[0.52em] font-semibold uppercase tracking-[0.2em] opacity-80">Security officer identity card</p>
        </div>
        <Icon name="guard" className="size-[1.7em] shrink-0 opacity-90" />
      </div>

      <div className="relative flex h-[81%] gap-[5%] px-[5%] pb-[7%] pt-[5%]">
        <div className="relative w-[28%] shrink-0">
          <Photo url={card.photoUrl} className="aspect-[3/4] w-full rounded-[0.5em] ring-1 ring-border" />
          <p className="mt-[0.6em] text-center font-mono text-[0.62em] font-semibold tracking-wider text-ink-muted">{card.cardNumber}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="min-w-0">
            <p className="truncate font-display text-[1.35em] font-bold leading-tight tracking-tight text-ink">{card.name}</p>
            <p className="text-[0.75em] font-semibold text-brand">{card.role}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-[6%] gap-y-[0.5em]">
            <Line label="Employee no." value={card.employeeNumber} />
            <Line label="PSIRA grade" value={card.psiraGrade || "Not on file"} />
            <Line label="PSIRA no." value={card.psiraNumber || "Not on file"} />
            <Line label="Issued" value={card.issuedOn} />
          </div>
          <Line label="Site" value={card.sites || "No site yet"} />
        </div>
        {/* A small faint second picture, as ID cards carry, so a swapped photo shows. */}
        <div className="pointer-events-none absolute bottom-[9%] right-[4%] w-[11%] opacity-[0.13] grayscale">
          <Photo url={card.photoUrl} className="aspect-[3/4] w-full rounded-[0.3em]" />
        </div>
      </div>
    </div>
  );
}

function Back({ card }: { card: IdCardDetails }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[0.9em] border border-border bg-surface shadow-floating [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <SecurityPrint microtext={card.company.toUpperCase()} />
      <div className="relative mt-[7%] h-[15%] bg-ink/85" />
      <div className="relative flex h-[78%] flex-col justify-between px-[6%] pb-[7%] pt-[5%]">
        <div>
          <p className="text-[0.55em] font-semibold uppercase tracking-[0.14em] text-ink-subtle">Holder&apos;s signature</p>
          <div className="mt-[0.4em] h-[2.6em] rounded-[0.3em] border border-border bg-[repeating-linear-gradient(135deg,var(--color-surface-muted)_0_6px,var(--color-surface)_6px_12px)]" />
        </div>
        <p className="text-[0.66em] leading-snug text-ink-muted">
          {`This card belongs to ${card.company} and must be handed back when asked or when its holder leaves. If you find it, please return it to ${card.company}.`}
        </p>
        <div className="flex items-end justify-between gap-[4%]">
          <Line label="Card no." value={card.cardNumber} />
          <p className="text-right text-[0.55em] font-semibold uppercase tracking-[0.14em] text-ink-subtle">Valid only with a current PSIRA registration</p>
        </div>
      </div>
    </div>
  );
}

/** What the guard's ID card will look like once printing comes. It turns over to show the back. */
export function IdCard({ card }: { card: IdCardDetails }) {
  const [back, setBack] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full max-w-[26rem] text-[clamp(11px,3.6vw,16px)] [perspective:1400px]">
        <div
          className={`relative aspect-[856/540] w-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${back ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <Front card={card} />
          <Back card={card} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setBack((current) => !current)}
          className="rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border"
        >
          {back ? "Show the front" : "Turn it over"}
        </button>
        <p className="text-xs text-ink-muted">A preview. Printing comes later.</p>
      </div>
    </div>
  );
}
