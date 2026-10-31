import Link from "next/link";
import type { ReactNode } from "react";

import { PAGE_SIZE } from "@/lib/paging";

import { Icon } from "./icon";

export type Crumb = { label: string; href?: string };

/** Where you are in company, client and site, with a way back up. */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-muted">
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {index > 0 ? <Icon name="chevron-right" className="size-3.5 text-ink-subtle" /> : null}
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-ink">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** One row you can click into. Long lists are made of these, never of whole forms. */
export function ListRow({ href, title, detail, trailing }: { href: string; title: string; detail: string; trailing?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-sm text-ink-muted">{detail}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {trailing}
          <Icon name="chevron-right" className="size-5 text-ink-subtle" />
        </span>
      </Link>
    </li>
  );
}

/** The frame around a list: its rows, or a message when there are none, and the pages underneath. */
export function ListCard({ empty, isEmpty, footer, children }: { empty: string; isEmpty: boolean; footer?: ReactNode; children?: ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      {isEmpty ? <p className="px-5 py-10 text-center text-sm text-ink-muted">{empty}</p> : <ul className="divide-y divide-border">{children}</ul>}
      {footer}
    </section>
  );
}

const PAGE_LINK = "inline-flex h-9 items-center rounded-pill bg-surface-muted px-4 text-sm font-semibold transition hover:bg-border";

export function Pagination({ page, total, hrefFor }: { page: number; total: number; hrefFor: (page: number) => string }) {
  if (total <= PAGE_SIZE) return null;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <p className="text-sm text-ink-muted">{`${first}–${last} of ${total}`}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={PAGE_LINK}>
            Previous
          </Link>
        ) : null}
        {last < total ? (
          <Link href={hrefFor(page + 1)} className={PAGE_LINK}>
            Next
          </Link>
        ) : null}
      </div>
    </footer>
  );
}

/** Tabs that are real links, so a page stays one thing at a time and the back button works. */
export function Tabs({ items }: { items: readonly { label: string; href: string; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-semibold transition-colors ${
            item.active ? "bg-ink text-ink-inverse" : "bg-surface text-ink hover:bg-border"
          }`}
        >
          {item.label}
          {item.count === undefined ? null : <span className={item.active ? "text-ink-inverse/70" : "text-ink-muted"}>{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
