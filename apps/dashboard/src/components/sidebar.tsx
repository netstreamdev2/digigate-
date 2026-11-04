"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { signOut } from "@/app/login/actions";
import type { CompanyBrand } from "@/lib/company-brand";
import { leaveCompany, stillInside, useCompanyContext } from "@/lib/company-context";
import { companyNav } from "@/lib/company-nav";

import { CompanyMark } from "./company-mark";
import { Icon, type IconName } from "./icon";
import { SearchTrigger } from "./quick-search";

export type NavItem = {
  label: string;
  icon: IconName;
  href: string;
};

type Props = {
  items: readonly NavItem[];
  userName: string;
  userRole: string;
  /** The company a signed-in admin or control room works for. Super users have none: they move between companies. */
  company: CompanyBrand | null;
  /** A super user gets the rail and a company's own sidebar while working inside a company. */
  isSuperUser: boolean;
};

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** A row in an open sidebar. The one pill (globals.css names it) slides to the page just opened. */
function NavRow({ label, icon, href, active, onNavigate }: { label: string; icon: IconName; href: string; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-11 items-center gap-3 rounded-pill px-3 text-sm font-medium transition-colors ${
        active ? "text-ink-inverse" : "text-ink-muted hover:bg-surface/60 hover:text-ink"
      }`}
    >
      {active ? <span aria-hidden="true" className="dg-nav-pill absolute inset-0 rounded-pill bg-brand shadow-floating" /> : null}
      <Icon name={icon} className="relative size-5 shrink-0" />
      <span className="relative flex-1 truncate">{label}</span>
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: readonly NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => (
        <NavRow key={item.href} {...item} active={isActive(path, item.href)} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function CompanyLinks({ company, onNavigate }: { company: CompanyBrand; onNavigate?: () => void }) {
  const path = usePathname();
  const filter = useSearchParams().get("company");
  return (
    <nav aria-label={`${company.name}'s pages`} className="flex flex-col gap-1">
      {companyNav(company.id).map((item) => (
        <NavRow key={item.label} label={item.label} icon={item.icon} href={item.href} active={item.isHere(path, filter)} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function CompanyBadge({ company }: { company: CompanyBrand }) {
  return (
    <div className="dg-glass-soft mt-6 flex items-center gap-3 rounded-lg px-3 py-2.5">
      <CompanyMark company={company} size={36} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{company.name}</p>
        <p className="truncate text-xs text-ink-muted">Your company</p>
      </div>
    </div>
  );
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="grid size-9 place-items-center rounded-pill text-ink-muted transition hover:bg-surface hover:text-ink"
      >
        <Icon name="sign-out" className="size-5" />
      </button>
    </form>
  );
}

function UserCard({ userName, userRole }: { userName: string; userRole: string }) {
  return (
    <div className="dg-glass-soft flex items-center gap-3 rounded-lg p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-brand font-display text-sm font-semibold text-ink-inverse">
        {userName.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{userName}</p>
        <p className="truncate text-xs text-ink-muted">{userRole}</p>
      </div>
      <SignOutButton />
    </div>
  );
}

/** The super user's own sidebar, folded to icons while they work inside a company. Hovering one says what it is. */
function Rail({ items, inside, userName }: { items: readonly NavItem[]; inside: CompanyBrand; userName: string }) {
  const path = usePathname();
  return (
    <div className="dg-rail relative z-20 flex h-full w-[4.75rem] shrink-0 flex-col items-center gap-2 py-6">
      <Link href="/setup" data-tip="All companies" aria-label="All companies" className="dg-rail-link mb-4 grid size-12 place-items-center rounded-[1.1rem]">
        <Image src="/logo-mark.svg" alt="" width={30} height={30} unoptimized priority />
      </Link>
      <nav aria-label="Main" className="flex flex-col items-center gap-1.5">
        <SearchTrigger shape="rail" />
        {items.map((item) => {
          const active = isActive(path, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tip={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`dg-rail-link grid size-12 place-items-center rounded-[1.1rem] transition-colors ${active ? "text-home ring-2 ring-home/25" : "text-ink-muted"}`}
            >
              <Icon name={item.icon} className="size-5" />
            </Link>
          );
        })}
      </nav>

      <div className="my-3 h-px w-8 bg-ink/10" aria-hidden="true" />
      <span data-tip={`Inside ${inside.name}`} className="dg-rail-link dg-rail-current grid size-12 place-items-center rounded-[1.1rem]">
        <CompanyMark company={inside} size={40} />
      </span>

      <div className="mt-auto flex flex-col items-center gap-2">
        <span data-tip={userName} className="dg-rail-link grid size-11 place-items-center rounded-pill bg-home font-display text-sm font-semibold text-ink-inverse">
          {userName.slice(0, 1)}
        </span>
        <SignOutButton />
      </div>
    </div>
  );
}

/** The company's own sidebar, beside the rail: its look, its pages, and the way back out. */
function CompanyPanel({ company }: { company: CompanyBrand }) {
  return (
    <div className="dg-company-panel flex h-full w-64 shrink-0 flex-col border-l border-ink/5 px-4 py-6">
      <div className="flex items-center gap-3 px-1">
        <CompanyMark company={company} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold tracking-tight">{company.name}</p>
          <p className="truncate text-xs font-semibold text-brand">Working inside</p>
        </div>
        <Link href="/setup" aria-label="Leave this company" title="Leave this company" className="grid size-9 shrink-0 place-items-center rounded-pill text-ink-muted transition hover:bg-surface hover:text-ink">
          <Icon name="close" className="size-5" />
        </Link>
      </div>
      <div className="-mx-1 mt-8 flex-1 overflow-y-auto px-1">
        <CompanyLinks company={company} />
      </div>
      <Link href="/setup" className="dg-glass-soft flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-ink-muted transition hover:text-ink">
        <Icon name="back" className="size-4" />
        All companies
      </Link>
    </div>
  );
}

/**
 * The dashboard's frame. Everyone gets a frosted sidebar on wide screens and a top bar with a menu on phones, and it
 * stays put between pages. A super user working inside a company gets their own sidebar folded to icons, with the
 * company's own sidebar open beside it, so they can work as that company's admin without losing their way back.
 */
export function Sidebar({ items, userName, userRole, company, isSuperUser }: Props) {
  const path = usePathname();
  const search = useSearchParams();
  const address = `${path}?${search.toString()}`;
  const context = useCompanyContext();
  const inside = isSuperUser && context && stillInside(context, address) ? context.company : null;
  const [open, setOpen] = useState(false);

  // Leaving the company's pages leaves the company.
  useEffect(() => {
    if (context && !stillInside(context, address)) leaveCompany();
  }, [address, context]);

  // A menu left open would cover the page just opened.
  const [shownFor, setShownFor] = useState(address);
  if (shownFor !== address) {
    setShownFor(address);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <div className="dg-sidebar dg-glass-bar sticky top-0 z-20 hidden h-screen shrink-0 lg:flex">
        {inside ? (
          <>
            <Rail items={items} inside={inside} userName={userName} />
            <CompanyPanel company={inside} />
          </>
        ) : (
          <aside className="flex h-full w-64 flex-col px-4 py-6">
            <Link href="/" className="px-3" aria-label="DigiGate home">
              <Image src="/logo.svg" alt="DigiGate" width={116} height={37} unoptimized priority />
            </Link>
            {company ? <CompanyBadge company={company} /> : null}
            <SearchTrigger shape="field" />
            <div className="-mx-1 mt-6 flex-1 overflow-y-auto px-1">
              <NavLinks items={items} />
            </div>
            <UserCard userName={userName} userRole={userRole} />
          </aside>
        )}
      </div>

      <header className="dg-topbar sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <Link href="/" aria-label="DigiGate home" className="flex min-w-0 items-center gap-3">
          <Image src="/logo.svg" alt="DigiGate" width={96} height={31} unoptimized priority />
          {inside ?? company ? <CompanyMark company={inside ?? company ?? { id: "", name: "", logoUrl: null, color: null }} size={28} /> : null}
        </Link>
        <div className="flex items-center gap-2">
        <SearchTrigger shape="icon" />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="dg-menu"
          aria-label={open ? "Close the menu" : "Open the menu"}
          className="grid size-11 place-items-center rounded-pill bg-surface text-ink shadow-card"
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close the menu" tabIndex={-1} onClick={() => setOpen(false)} className="dg-scrim absolute inset-0 bg-ink/30" />
          <div id="dg-menu" className="dg-drawer dg-glass-bar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto px-4 py-6">
            <div className="px-3">
              <Image src="/logo.svg" alt="DigiGate" width={116} height={37} unoptimized />
            </div>
            {inside ? (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-3 px-1">
                  <CompanyMark company={inside} size={36} />
                  <p className="min-w-0 truncate text-sm font-semibold">{inside.name}</p>
                </div>
                <CompanyLinks company={inside} onNavigate={() => setOpen(false)} />
                <p className="mt-2 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle">DigiGate</p>
              </section>
            ) : company ? (
              <CompanyBadge company={company} />
            ) : null}
            <div className="flex-1">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </div>
            <UserCard userName={userName} userRole={userRole} />
          </div>
        </div>
      ) : null}
    </>
  );
}
