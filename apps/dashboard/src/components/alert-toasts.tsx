"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { recentAlerts, type FeedAlert } from "@/app/(app)/alert-feed";
import { timeOfDay } from "@/lib/format";

import { Icon } from "./icon";

const POLL_MS = 10_000;
const AMBER_SHOWN_MS = 15_000;
const MOST_SHOWN = 4;
const SOUND_KEY = "dg-alert-sound";
const SOUND_CHANGED = "dg-alert-sound-changed";

function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function setSound(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(SOUND_CHANGED));
}

const subscribeSound = (listener: () => void) => {
  window.addEventListener(SOUND_CHANGED, listener);
  return () => window.removeEventListener(SOUND_CHANGED, listener);
};

/** Two short rising tones, made in the browser, so there's no sound file to load. Browsers only play after a click. */
function chime(context: AudioContext): void {
  const start = context.currentTime;
  [880, 1175].forEach((frequency, index) => {
    const tone = context.createOscillator();
    const level = context.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    const at = start + index * 0.18;
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    level.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    tone.connect(level).connect(context.destination);
    tone.start(at);
    tone.stop(at + 0.17);
  });
}

/**
 * New red and amber alerts, wherever someone is on the dashboard. A red one chimes and stays until it's closed; an
 * amber one goes after a while. What was already open when the page loaded isn't announced again, and colour is
 * never the only sign: each says what it is and carries its icon.
 */
export function AlertToasts() {
  const [shown, setShown] = useState<readonly FeedAlert[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const sound = useSyncExternalStore(subscribeSound, soundOn, () => true);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const alerts = await recentAlerts().catch(() => null);
      // A failed round says nothing: the next one, ten seconds on, picks up whatever was missed.
      if (stopped || !alerts) return;
      if (!seen.current) {
        seen.current = new Set(alerts.map((alert) => alert.id));
        return;
      }
      const fresh = alerts.filter((alert) => !seen.current?.has(alert.id));
      if (fresh.length === 0) return;
      fresh.forEach((alert) => seen.current?.add(alert.id));
      setShown((current) => [...fresh, ...current].slice(0, MOST_SHOWN));
      if (fresh.some((alert) => alert.severity === "red") && soundOn()) {
        try {
          audio.current ??= new AudioContext();
          void audio.current.resume().then(() => {
            if (audio.current) chime(audio.current);
          });
        } catch {
          return;
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  // Amber alerts make way after a while; red ones wait for someone to close them.
  useEffect(() => {
    const amber = shown.filter((alert) => alert.severity === "amber");
    if (amber.length === 0) return;
    const timer = setTimeout(() => setShown((current) => current.filter((alert) => alert.severity !== "amber" || !amber.includes(alert))), AMBER_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (shown.length === 0) return null;
  const dismiss = (id: string) => setShown((current) => current.filter((alert) => alert.id !== id));

  return createPortal(
    <section aria-label="New alerts" aria-live="assertive" className="dg-toasts fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {shown.map((alert) => {
        const red = alert.severity === "red";
        return (
          <article
            key={alert.id}
            className={`dg-toast relative overflow-hidden rounded-lg bg-surface p-4 pl-5 shadow-floating ring-1 ${red ? "ring-blocked/40" : "ring-warning/40"}`}
          >
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${red ? "bg-blocked" : "bg-warning"}`} />
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-pill ${red ? "bg-blocked-soft text-blocked" : "bg-warning-soft text-warning"}`}>
                <Icon name={red ? "result-blocked" : "result-warning"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-bold uppercase tracking-[0.08em] ${red ? "text-blocked" : "text-warning"}`}>{red ? "Blocked at the gate" : "Warning at the gate"}</p>
                <p className="truncate font-display text-base font-semibold tracking-tight">{alert.title}</p>
                <p className="truncate text-xs text-ink-muted">{`${alert.site} · ${timeOfDay(alert.at)}${alert.foundAfter ? " · found after the gate" : ""}`}</p>
              </div>
              <button type="button" onClick={() => dismiss(alert.id)} aria-label="Close this alert" className="grid size-8 shrink-0 place-items-center rounded-pill text-ink-muted transition hover:bg-surface-muted hover:text-ink">
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 pl-[3.25rem]">
              <Link href={`/control-room/${alert.siteId}`} onClick={() => dismiss(alert.id)} className={`inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold text-ink-inverse transition hover:bg-ink ${red ? "bg-blocked" : "bg-warning"}`}>
                Open the control room
              </Link>
              <button type="button" onClick={() => setSound(!sound)} className="text-xs font-semibold text-ink-muted hover:text-ink">
                {sound ? "Sound off" : "Sound on"}
              </button>
            </div>
          </article>
        );
      })}
    </section>,
    document.body,
  );
}
