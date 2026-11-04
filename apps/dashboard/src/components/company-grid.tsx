import { countLabel } from "@digigate/core";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { CompanyCardData } from "@/lib/company-brand";
import { plural } from "@/lib/format";

import { CompanyMark } from "./company-mark";
import { Icon } from "./icon";
import { StatusChip } from "./status-chip";

function Figure({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl font-semibold tabular-nums tracking-tight ${alert && value > 0 ? "text-blocked" : ""}`}>{countLabel(value)}</dd>
    </div>
  );
}

function CompanyCard({ company, href, index }: { company: CompanyCardData; href: string; index: number }) {
  const style = {
    "--dg-i": index,
    ...(company.color ? { "--dg-card-glow": `color-mix(in srgb, ${company.color} 45%, transparent)` } : {}),
  } as CSSProperties;
  return (
    <li style={style}>
      <Link href={href} data-morph={`company-${company.id}`} className="dg-glass dg-company-card group flex h-full flex-col p-5">
        <div className="flex items-start gap-4">
          <span className="dg-card-mark">
            <CompanyMark company={company} size={56} morph />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight">{company.name}</h2>
            <p className="mt-0.5 truncate text-sm text-ink-muted">{`${plural(company.sites, "site")} · ${countLabel(company.gateStaff)} gate staff`}</p>
          </div>
          <Icon name="chevron-right" className="dg-card-arrow mt-2 size-5 shrink-0 text-ink-subtle" />
        </div>

        <div className="mt-4 flex min-h-7 flex-wrap gap-2">
          {company.isActive ? null : <StatusChip status="blocked" label="Inactive" />}
          {company.openAlerts > 0 ? <StatusChip status="blocked" label={`${countLabel(company.openAlerts)} blocked, open`} /> : null}
          {company.isActive && company.openAlerts === 0 ? <StatusChip status="clear" label="All quiet" /> : null}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-ink/10 pt-4">
          <Figure label="People on site" value={company.onSite} />
          <Figure label="Cars inside" value={company.carsOnSite} />
          <Figure label="Open blocks" value={company.openAlerts} alert />
        </dl>
      </Link>
    </li>
  );
}

/** Every company a super user looks after, as cards that carry each company's own logo and colour. */
export function CompanyGrid({ companies, hrefFor, empty }: { companies: readonly CompanyCardData[]; hrefFor: (id: string) => string; empty: string }) {
  if (companies.length === 0) return <div className="dg-glass mt-6 px-5 py-14 text-center text-sm text-ink-muted">{empty}</div>;
  return (
    <ul className="dg-ripple mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {companies.map((company, index) => (
        <CompanyCard key={company.id} company={company} href={hrefFor(company.id)} index={index} />
      ))}
    </ul>
  );
}
