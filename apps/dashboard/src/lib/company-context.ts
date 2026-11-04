import { useSyncExternalStore } from "react";

import type { CompanyBrand } from "./company-brand";

/**
 * Which company a super user is working inside, for the sidebar. A company's pages announce it (components/
 * company-beacon.tsx); it lasts while the address still names that company or one of its sites, so the panel doesn't
 * blink out while the next of its pages loads.
 */
export type CompanyContext = { company: CompanyBrand; keys: readonly string[] };

let current: CompanyContext | null = null;
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((listener) => listener());

export function enterCompany(next: CompanyContext): void {
  if (current?.company.id === next.company.id && current.keys.join() === next.keys.join() && current.company.logoUrl === next.company.logoUrl && current.company.color === next.company.color) return;
  current = next;
  announce();
}

/**
 * A page filtered to a company keeps a super user inside it if they're already there, and adds its own keys (a site's
 * page, say), but never takes them in: filtering a list by company is still the everyday view.
 */
export function stayInCompany(next: CompanyContext): void {
  if (current?.company.id !== next.company.id) return;
  enterCompany({ company: next.company, keys: [...new Set([...current.keys, ...next.keys])] });
}

export function leaveCompany(): void {
  if (!current) return;
  current = null;
  announce();
}

/** Whether an address is still about the company: it names the company, or a site the company's page said is its own. */
export const stillInside = (context: CompanyContext, address: string) => context.keys.some((key) => address.includes(key));

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useCompanyContext(): CompanyContext | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
