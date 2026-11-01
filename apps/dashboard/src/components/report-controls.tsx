"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Icon } from "./icon";

const STEP = "grid size-9 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-ink/5";

/** The address with one value changed, keeping the rest and going back to the first page. */
function useHrefWith() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(name, value);
    next.delete("page");
    return `${pathname}?${next.toString()}`;
  };
}

/** Moves between days: a step back, a calendar and a step forward. */
export function DayPicker({ day, previous, next, label }: { day: string; previous: string; next: string | null; label: string }) {
  const router = useRouter();
  const hrefWith = useHrefWith();
  return (
    <div className="dg-glass flex h-11 items-center gap-1 rounded-pill px-1">
      <Link href={hrefWith("day", previous)} aria-label="The day before" className={STEP}>
        <Icon name="back" className="size-4" />
      </Link>
      <label className="flex items-center gap-2 px-1 text-sm font-semibold">
        <Icon name="calendar" className="size-4 text-ink-muted" />
        <span>{label}</span>
        <span className="sr-only">Choose a day</span>
        <input
          type="date"
          value={day}
          max={next === null ? day : undefined}
          onChange={(event) => {
            if (event.target.value) router.push(hrefWith("day", event.target.value));
          }}
          className="w-5 cursor-pointer bg-transparent text-transparent outline-none"
        />
      </label>
      {next ? (
        <Link href={hrefWith("day", next)} aria-label="The day after" className={STEP}>
          <Icon name="chevron-right" className="size-4" />
        </Link>
      ) : (
        <span className={`${STEP} cursor-not-allowed text-ink-subtle hover:bg-transparent`} aria-hidden="true">
          <Icon name="chevron-right" className="size-4" />
        </span>
      )}
    </div>
  );
}

type SegmentProps = {
  items: readonly { label: string; href: string; active: boolean }[];
  label: string;
};

/** A row of choices where exactly one is on, as real links so the back button works. */
export function SegmentedLinks({ items, label }: SegmentProps) {
  return (
    <nav aria-label={label} className="dg-glass flex h-11 max-w-full items-center gap-1 overflow-x-auto rounded-pill p-1">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`inline-flex h-9 shrink-0 items-center rounded-pill px-4 text-sm font-semibold transition-colors ${item.active ? "bg-ink text-ink-inverse" : "text-ink hover:bg-ink/5"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** The two ends of a date range, each its own calendar. */
export function DateRange({ from, to, latest }: { from: string; to: string; latest: string }) {
  const router = useRouter();
  const hrefWith = useHrefWith();
  const FIELD = "h-9 rounded-pill bg-transparent px-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <div className="dg-glass flex h-11 items-center gap-1 rounded-pill px-2">
      <Icon name="calendar" className="ml-1 size-4 text-ink-muted" />
      <label>
        <span className="sr-only">From</span>
        <input type="date" value={from} max={to} className={FIELD} onChange={(event) => event.target.value && router.push(hrefWith("from", event.target.value))} />
      </label>
      <span className="text-sm text-ink-muted">to</span>
      <label>
        <span className="sr-only">To</span>
        <input type="date" value={to} min={from} max={latest} className={FIELD} onChange={(event) => event.target.value && router.push(hrefWith("to", event.target.value))} />
      </label>
    </div>
  );
}
