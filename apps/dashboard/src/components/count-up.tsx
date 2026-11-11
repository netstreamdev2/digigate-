"use client";

import { useEffect, useState } from "react";

import { dataSize } from "@/lib/format";

const DURATION_MS = 900;

const FORMATS = {
  count: (value: number) => Math.round(value).toLocaleString("en-ZA"),
  percent: (value: number) => `${Math.round(value)}%`,
  data: (value: number) => dataSize(value),
} as const;

/**
 * A figure that counts up to its value when it arrives, easing out, so a page of numbers settles rather than blinks
 * in. The final value is in the server's HTML, so it reads right before the script runs and for people who turn
 * animation off.
 */
export function CountUp({ value, format = "count" }: { value: number; format?: keyof typeof FORMATS }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) return;
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      setShown(value * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{FORMATS[format](shown)}</span>;
}
