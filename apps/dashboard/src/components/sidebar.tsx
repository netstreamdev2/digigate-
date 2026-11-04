"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { signOut } from "@/app/login/actions";
import type { CompanyBrand } from "@/lib/company-brand";

import { CompanyMark } from "./company-mark";
import { Icon, type IconName } from "./icon";

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
};

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function NavLinks({ items, onNavigate }: { items: readonly NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(path, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-11 items-center gap-3 rounded-pill px-3 text-sm font-medium transition-colors ${
              active ? "text-ink-inverse" : "text-ink-muted hover:bg-surface/60 hover:text-ink"
            }`}
          >
            {/* The sidebar's one pill is named for the page transition (globals.css), so it slides to the new page. */}
            {active ? <span aria-hidden="true" className="dg-nav-pill absolute inset-0 rounded-pill bg-brand shadow-floating" /> : null}
            <Icon name={item.icon} className="relative size-5 shrink-0" />
            <span className="relative flex-1">{item.label}</span>
          </Link>
        );
      })}
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

function UserCard({ userName, userRole }: { userName: string; userRole: string }) {
  return (
    <div className="dg-glass-soft flex items-center gap-3 rounded-lg p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-brand font-display text-sm font-semibold text-ink-inverse">
        {userName.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{userName}</p>
        <p className="truncate text-xs text-ink-muted">{userRole}</p>
      </div>
      <form action={signOut} className="ml-auto">
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-9 place-items-center rounded-pill text-ink-muted transition hover:bg-surface hover:text-ink"
        >
          <Icon name="sign-out" className="size-5" />
        </button>
      </form>
    </div>
  );
}

/** The dashboard's frame: a frosted bar on wide screens, a top bar with a menu on phones. It stays put between pages. */
export function Sidebar({ items, userName, userRole, company }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // A menu left open would cover the page just opened.
  const [shownFor, setShownFor] = useState(path);
  if (shownFor !== path) {
    setShownFor(path);
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
      <aside className="dg-sidebar dg-glass-bar sticky top-0 hidden h-screen w-64 shrink-0 flex-col px-4 py-6 lg:flex">
        <Link href="/" className="px-3" aria-label="DigiGate home">
          <Image src="/logo.svg" alt="DigiGate" width={116} height={37} unoptimized priority />
        </Link>
        {company ? <CompanyBadge company={company} /> : null}
        <div className="-mx-1 mt-8 flex-1 overflow-y-auto px-1">
          <NavLinks items={items} />
        </div>
        <UserCard userName={userName} userRole={userRole} />
      </aside>

      <header className="dg-topbar sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <Link href="/" aria-label="DigiGate home" className="flex min-w-0 items-center gap-3">
          <Image src="/logo.svg" alt="DigiGate" width={96} height={31} unoptimized priority />
          {company ? <CompanyMark company={company} size={28} /> : null}
        </Link>
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
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close the menu" tabIndex={-1} onClick={() => setOpen(false)} className="dg-scrim absolute inset-0 bg-ink/30" />
          <div id="dg-menu" className="dg-drawer dg-glass-bar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 px-4 py-6">
            <div className="px-3">
              <Image src="/logo.svg" alt="DigiGate" width={116} height={37} unoptimized />
            </div>
            {company ? <CompanyBadge company={company} /> : null}
            <div className="flex-1 overflow-y-auto">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </div>
            <UserCard userName={userName} userRole={userRole} />
          </div>
        </div>
      ) : null}
    </>
  );
}
