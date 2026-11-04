"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { quickSearch, type SearchHit } from "@/app/(app)/quick-search";

import { Icon } from "./icon";
import type { NavItem } from "./sidebar";

const OPEN_EVENT = "dg-quick-search";
const SEARCH_DELAY_MS = 180;

/** Opens the search from anywhere: a button, or Ctrl+K (⌘K on a Mac). */
export const openQuickSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

const never = () => () => undefined;

/** How the shortcut is written on this computer. */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    never,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** The way in for anyone who'd rather click: a search field in the sidebar, or an icon on the rail and on phones. */
export function SearchTrigger({ shape }: { shape: "field" | "icon" | "rail" }) {
  const shortcut = useShortcutLabel();
  if (shape === "field") {
    return (
      <button
        type="button"
        onClick={openQuickSearch}
        className="dg-glass-soft mt-6 flex h-11 w-full items-center gap-2.5 rounded-pill px-4 text-sm text-ink-muted transition hover:bg-surface hover:text-ink"
      >
        <Icon name="search" className="size-[18px] shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-subtle shadow-card">{shortcut}</kbd>
      </button>
    );
  }
  if (shape === "rail") {
    return (
      <button type="button" onClick={openQuickSearch} data-tip={`Search (${shortcut})`} aria-label="Search" className="dg-rail-link grid size-12 place-items-center rounded-[1.1rem] text-ink-muted">
        <Icon name="search" className="size-5" />
      </button>
    );
  }
  return (
    <button type="button" onClick={openQuickSearch} aria-label="Search" className="grid size-11 place-items-center rounded-pill bg-surface text-ink shadow-card">
      <Icon name="search" />
    </button>
  );
}

/**
 * Ctrl+K: one box that finds anything, from a page of the dashboard to a plate inside right now. Pages match as you
 * type; everything else is asked of the server after a short pause, and only what you may see comes back.
 */
export function QuickSearch({ pages }: { pages: readonly NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ for: string; hits: SearchHit[]; problem: string | null }>({ for: "", hits: [], problem: null });
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const term = text.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      quickSearch(term).then(
        (result) => {
          if (current) setFound({ for: term, ...result });
        },
        () => {
          if (current) setFound({ for: term, hits: [], problem: "The search didn't load. Check your connection and try again." });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term]);

  const results = useMemo(() => {
    const lower = term.toLowerCase();
    const pageHits: SearchHit[] = pages
      .filter((page) => !lower || page.label.toLowerCase().includes(lower))
      .map((page) => ({ group: "Pages", label: page.label, detail: "Go to the page", href: page.href, icon: page.icon }));
    return [...pageHits, ...(term.length >= 2 && found.for === term ? found.hits : [])];
  }, [pages, term, found]);
  const waiting = term.length >= 2 && found.for !== term;

  const close = () => {
    setOpen(false);
    setText("");
    setActive(0);
  };

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    close();
    router.push(hit.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  };

  if (!open) return null;

  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <button type="button" aria-label="Close the search" tabIndex={-1} onClick={close} className="dg-scrim absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="Search DigiGate" className="dg-palette relative w-full max-w-2xl overflow-hidden rounded-xl bg-surface shadow-floating ring-1 ring-border">
        <div className="flex items-center gap-3 border-b border-border px-5">
          <Icon name="search" className="size-5 shrink-0 text-ink-subtle" />
          <input
            ref={input}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search a page, company, site, name or plate"
            aria-label="Search"
            aria-controls="dg-search-results"
            aria-activedescendant={results[active] ? `dg-hit-${active}` : undefined}
            autoComplete="off"
            className="h-16 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-subtle"
          />
          <kbd className="rounded-md bg-surface-muted px-2 py-1 text-xs font-semibold text-ink-muted">Esc</kbd>
        </div>

        <ul id="dg-search-results" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
          {results.map((hit, index) => {
            const heading = hit.group !== lastGroup ? hit.group : null;
            lastGroup = hit.group;
            return (
              <li key={`${hit.group}-${hit.href}-${index}`} role="presentation">
                {heading ? <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle">{heading}</p> : null}
                <Link
                  id={`dg-hit-${index}`}
                  role="option"
                  aria-selected={index === active}
                  href={hit.href}
                  onClick={close}
                  onMouseEnter={() => setActive(index)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${index === active ? "bg-brand text-ink-inverse" : "text-ink"}`}
                >
                  <span className={`grid size-9 shrink-0 place-items-center rounded-pill ${index === active ? "bg-ink-inverse/15" : "bg-surface-muted text-ink-muted"}`}>
                    <Icon name={hit.icon} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{hit.label}</span>
                    <span className={`block truncate text-xs ${index === active ? "text-ink-inverse/75" : "text-ink-muted"}`}>{hit.detail}</span>
                  </span>
                  {index === active ? <Icon name="chevron-right" className="size-4 shrink-0" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-ink-muted">
          <span>{waiting ? "Searching…" : found.problem && found.for === term ? found.problem : term.length >= 2 && results.length === 0 ? "Nothing matches that." : "↑ ↓ to choose · Enter to open"}</span>
          <span>Names and plates come from the last 30 days</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
