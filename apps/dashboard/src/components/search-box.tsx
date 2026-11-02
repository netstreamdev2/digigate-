"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Icon } from "./icon";

const SEARCH_DELAY_MS = 300;

/** Changes one value in the address, which is what makes the server fetch the matching page. Goes back to page one. */
function useAddressParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname);
  };
}

/** Searches as you type, after a short pause, so each keystroke isn't a trip to the database. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const params = useSearchParams();
  const setParam = useAddressParam();
  const [text, setText] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam("q", value.trim()), SEARCH_DELAY_MS);
  };

  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-surface px-4 transition-shadow focus-within:border-brand focus-within:ring-4 focus-within:ring-tile-sky sm:max-w-sm">
      <Icon name="search" className="size-5 shrink-0 text-ink-subtle" />
      <span className="sr-only">Search</span>
      <input type="search" value={text} onChange={change} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle" />
    </label>
  );
}

/** A dropdown filter on a list. */
export function FilterSelect({ name, label, options }: { name: string; label: string; options: readonly { value: string; label: string }[] }) {
  const params = useSearchParams();
  const setParam = useAddressParam();
  return (
    <label className="flex h-11 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={params.get(name) ?? ""}
        onChange={(event) => setParam(name, event.target.value)}
        className="h-11 max-w-56 rounded-pill border border-border bg-surface px-4 text-sm font-medium outline-none focus:border-brand focus:ring-4 focus:ring-tile-sky"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
