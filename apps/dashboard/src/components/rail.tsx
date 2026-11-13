"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "./icon";

const ARROW = "grid size-10 place-items-center rounded-pill bg-surface text-ink shadow-floating transition hover:bg-ink hover:text-ink-inverse disabled:pointer-events-none disabled:opacity-0";

/**
 * Cards in a row that slides: arrows step a card at a time, a trackpad or finger drags it, and each card snaps into
 * place. The arrows only show when there's more to see that way. Built for a short list (a page at most), never the
 * whole fleet.
 */
export function Rail({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    setEnds({ start: element.scrollLeft <= 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const element = track.current;
    if (!element) return;
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    return () => resized.disconnect();
  }, [measure]);

  const step = (direction: 1 | -1) => {
    const element = track.current;
    const card = element?.firstElementChild;
    if (!element || !(card instanceof HTMLElement)) return;
    element.scrollBy({ left: direction * (card.offsetWidth + 16) });
  };

  return (
    <div className="relative">
      <div
        ref={track}
        onScroll={measure}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-at-start={ends.start}
        data-at-end={ends.end}
        className="dg-rail -mx-2 flex gap-4 overflow-x-auto px-2 py-3 outline-none"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 -left-3 flex items-center">
        <button type="button" aria-label="Back" disabled={ends.start} onClick={() => step(-1)} className={`pointer-events-auto ${ARROW}`}>
          <Icon name="chevron-right" className="size-5 rotate-180" />
        </button>
      </div>
      <div className="pointer-events-none absolute inset-y-0 -right-3 flex items-center">
        <button type="button" aria-label="More" disabled={ends.end} onClick={() => step(1)} className={`pointer-events-auto ${ARROW}`}>
          <Icon name="chevron-right" className="size-5" />
        </button>
      </div>
    </div>
  );
}
