"use client";

import Link from "next/link";

import type { CompanyBrand } from "@/lib/company-brand";
import { useCompanyContext } from "@/lib/company-context";

import { CompanyMark } from "./company-mark";
import { Icon } from "./icon";

/**
 * Who a super user is working inside, at the top of that company's pages. Only once they've gone into the company: a
 * list they've just filtered to it is still the everyday view, and offers a way in instead. The company's own pages
 * are in the sidebar beside the rail; on a phone, in the menu.
 */
export function CompanyBanner({ company }: { company: CompanyBrand }) {
  const inside = useCompanyContext()?.company.id === company.id;
  if (!inside) {
    return (
      <Link
        href={`/setup/${company.id}`}
        className="dg-glass-soft mb-6 inline-flex h-10 items-center gap-2.5 rounded-pill py-1 pl-1.5 pr-4 text-sm font-semibold text-ink transition hover:bg-surface"
      >
        <CompanyMark company={company} size={28} />
        {`Go into ${company.name}`}
        <Icon name="chevron-right" className="size-4 text-ink-subtle" />
      </Link>
    );
  }
  return (
    <section aria-label={`Working inside ${company.name}`} className="dg-glass dg-company-banner relative mb-8 overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-5">
        <span data-morph-target={`company-${company.id}`}>
          <CompanyMark company={company} size={72} morph />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
            <Icon name="supervisor" className="size-4" />
            Super user, working inside
          </p>
          <p className="mt-1 truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">{company.name}</p>
        </div>
        <Link
          href="/setup"
          className="inline-flex h-10 items-center gap-2 rounded-pill bg-surface/70 px-4 text-sm font-semibold text-ink shadow-card transition hover:bg-surface"
        >
          <Icon name="back" className="size-4" />
          All companies
        </Link>
      </div>
    </section>
  );
}
