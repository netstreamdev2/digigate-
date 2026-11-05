import type { ReactNode } from "react";

/**
 * A list's search and filters, right on top of the list they narrow, so what changes the list sits next to it. The
 * page's header keeps what isn't a filter: adding something, the live status, the period a whole page covers.
 */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="search" aria-label={label} className="mt-4 -mb-2 flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}
