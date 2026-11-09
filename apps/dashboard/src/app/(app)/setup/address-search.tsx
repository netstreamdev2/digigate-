"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Icon } from "@/components/icon";
import type { PlaceChoice } from "@/lib/places";

import { placeChoices } from "./actions";

const SEARCH_DELAY_MS = 300;
const SEARCH_MIN = 3;
const CONTROL =
  "h-12 w-full rounded-md border border-border bg-surface px-4 text-sm outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-tile-sky";

type Found = { term: string; places: PlaceChoice[]; problem: string | null };

/**
 * An address field that searches as it's typed, for a place like a mall or a hospital as well as a street. Picking one
 * fills in the address and where it is. Anything typed by hand is kept as it is.
 */
export function AddressSearch({ value, onChange, onPick }: { value: string; onChange: (next: string) => void; onPick: (place: PlaceChoice) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [active, setActive] = useState(0);
  // Only what the person typed is searched, never the address a pick just filled in.
  const [term, setTerm] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < SEARCH_MIN) return;
    let current = true;
    const timer = setTimeout(() => {
      placeChoices(trimmed).then(
        (next) => {
          if (!current) return;
          setFound({ term: trimmed, ...next });
          setActive(0);
        },
        () => {
          if (current) setFound({ term: trimmed, places: [], problem: "The address search didn't load. Check your connection, or type the address yourself." });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (boxRef.current && event.target instanceof Node && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const searching = term.trim().length >= SEARCH_MIN && found?.term !== term.trim();
  const places = found && found.term === term.trim() ? found.places : [];
  const showList = open && term.trim().length >= SEARCH_MIN;

  const pick = (place: PlaceChoice) => {
    onPick(place);
    setTerm("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList || places.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((at) => (at + 1) % places.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => (at - 1 + places.length) % places.length);
    } else if (event.key === "Enter") {
      const place = places[active];
      if (place) {
        event.preventDefault();
        pick(place);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative z-30 flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${id}-input`} className="text-sm font-medium">
        Address
      </label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && places[active] ? `${id}-${active}` : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a place or street, like Gateway Mall"
          autoComplete="off"
          className={`${CONTROL} pl-10`}
        />
      </div>
      {showList ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-surface shadow-card">
          <ul id={`${id}-list`} role="listbox" aria-label="Matching places" className="max-h-80 divide-y divide-border overflow-y-auto">
            {places.map((place, index) => (
              <li
                key={place.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => pick(place)}
                onPointerEnter={() => setActive(index)}
                className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${index === active ? "bg-surface-muted" : ""}`}
              >
                <Icon name="sites" className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{place.name}</span>
                  <span className="block text-xs text-ink-muted">{place.address}</span>
                </span>
              </li>
            ))}
          </ul>
          {searching ? <p className="px-4 py-3 text-sm text-ink-muted">Searching…</p> : null}
          {!searching && found?.problem ? <p className="px-4 py-3 text-sm text-blocked">{found.problem}</p> : null}
          {!searching && !found?.problem && places.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">Nothing found. Keep typing the address yourself, and paste its location from Google Maps below.</p>
          ) : null}
          <p className="border-t border-border px-4 py-2 text-xs text-ink-subtle">Places from © OpenStreetMap contributors</p>
        </div>
      ) : null}
    </div>
  );
}
