"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { CompanyBrand } from "@/lib/company-brand";

import { CompanyMark } from "./company-mark";
import { Icon } from "./icon";

type Jump = { label: string; href: string; path: string; company?: boolean };

const jumpsFor = (id: string): readonly Jump[] => [
  { label: "Sites", href: `/setup/${id}`, path: `/setup/${id}` },
  { label: "Admin", href: `/admin/${id}`, path: `/admin/${id}` },
  { label: "Reports", href: `/reports/${id}`, path: `/reports/${id}` },
  { label: "Hotlist", href: `/hotlist?company=${id}`, path: "/hotlist", company: true },
  { label: "Expected visitors", href: `/expected?company=${id}`, path: "/expected", company: true },
  { label: "People", href: `/people?company=${id}`, path: "/people", company: true },
  { label: "Devices", href: `/devices?company=${id}`, path: "/devices", company: true },
  { label: "Audit log", href: `/audit?company=${id}`, path: "/audit", company: true },
];

/**
 * Who a super user is working inside, said at the top of every one of that company's pages: its logo, its name and a
 * way into each part of it, so nobody has to read the breadcrumbs to know whose records are on screen.
 */
export function CompanyBanner({ company }: { company: CompanyBrand }) {
  const path = usePathname();
  const search = useSearchParams();
  const isHere = (jump: Jump) =>
    jump.company ? path === jump.path && search.get("company") === company.id : path === jump.path || path.startsWith(`${jump.path}/`);

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
      <nav aria-label={`${company.name}'s pages`} className="mt-5 flex gap-1.5 overflow-x-auto pb-0.5">
        {jumpsFor(company.id).map((jump) => {
          const here = isHere(jump);
          return (
            <Link
              key={jump.label}
              href={jump.href}
              aria-current={here ? "page" : undefined}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-semibold transition ${
                here ? "bg-brand text-ink-inverse" : "text-ink-muted hover:bg-surface/70 hover:text-ink"
              }`}
            >
              {jump.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
