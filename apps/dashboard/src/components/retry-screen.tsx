"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect } from "react";

const RETRY_MS = 5_000;

/** For a page that couldn't load: says so plainly and keeps trying, so nobody has to notice it came back. */
export function RetryScreen({ title, message, reset }: { title: string; message: string; reset: () => void }) {
  const router = useRouter();

  // The page's data comes from the server, so it has to be fetched again as well as drawn again.
  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [reset, router]);

  useEffect(() => {
    const timer = setInterval(retry, RETRY_MS);
    return () => clearInterval(timer);
  }, [retry]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-ink-muted">{message}</p>
        <button type="button" onClick={retry} className="inline-flex h-11 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink">
          Try again now
        </button>
      </div>
    </main>
  );
}
