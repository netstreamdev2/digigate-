"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

type Option = { value: string; label: string; href?: string };

/**
 * A choice of a few, as pills with a highlight that slides to the one chosen. With `href`s it moves straight away and
 * then opens the page; without, it tells `onChange`.
 */
export function Segmented({ label, options, value, onChange }: { label: string; options: readonly Option[]; value: string; onChange?: (value: string) => void }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(value);
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const button = box.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(chosen)}"]`);
    if (button) setPill({ left: button.offsetLeft, width: button.offsetWidth });
  }, [chosen]);

  const choose = (option: Option) => {
    setChosen(option.value);
    if (option.href) router.push(option.href, { scroll: false });
    else onChange?.(option.value);
  };

  return (
    <div ref={box} role="radiogroup" aria-label={label} className="relative inline-flex rounded-pill bg-surface-muted p-1">
      {pill ? <span aria-hidden="true" className="dg-segment-pill absolute inset-y-1 rounded-pill bg-surface shadow-floating" style={{ left: pill.left, width: pill.width }} /> : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === chosen}
          data-value={option.value}
          onClick={() => choose(option)}
          className={`relative z-10 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${option.value === chosen ? "text-ink" : "text-ink-muted hover:text-ink"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
