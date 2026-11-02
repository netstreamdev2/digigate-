"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusChip } from "./status-chip";

const REFRESH_MS = 5_000;
const STALE_MS = 20_000;

export function LiveChip({ updatedAt }: { updatedAt: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-pill bg-clear-soft px-4 text-sm font-semibold text-clear">
      <span className="size-2 rounded-pill bg-clear" aria-hidden="true" />
      Live · updated {updatedAt}
    </span>
  );
}

/**
 * Keeps a page current by asking the server for it again, only while someone is looking. When fresh data stops
 * arriving the chip says so, because a control room must never mistake a stale screen for a quiet gate.
 */
export function LiveStatus({ renderedAt, updatedAt }: { renderedAt: number; updatedAt: string }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const check = () => {
      setStale(Date.now() - renderedAt > STALE_MS);
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    };
    const timer = setInterval(check, REFRESH_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [renderedAt, router]);

  return stale ? <StatusChip status="warning" label={`No connection · last updated ${updatedAt}`} /> : <LiveChip updatedAt={updatedAt} />;
}
