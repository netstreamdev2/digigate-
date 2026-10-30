"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { Icon, type IconName } from "./icon";

const SLOGANS: readonly { icon: IconName; text: string }[] = [
  { icon: "vehicle", text: "Same driver. Same car. Or the boom stays down." },
  { icon: "on-site", text: "Know who's on site, right now." },
  { icon: "offline", text: "No signal? The gate keeps working." },
  { icon: "guard", text: "Every shift, on the record." },
  { icon: "result-blocked", text: "Caught at the gate, not after the fact." },
  { icon: "visits", text: "Every visit, from the boom in to the boom out." },
];

const SLOGAN_MS = 4_500;
const SEEN_KEY = "digigate.slogan";

/** The right of the sign-in screens: the logo, with a slogan and its icon changing beneath it over slow radar rings. */
export function BrandPanel() {
  const [index, setIndex] = useState(0);

  // Each visit opens on the next saying. Storage can be blocked, and then it simply starts at the first.
  useEffect(() => {
    try {
      const next = (Number(localStorage.getItem(SEEN_KEY) ?? -1) + 1) % SLOGANS.length;
      localStorage.setItem(SEEN_KEY, String(next));
      setIndex(next);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % SLOGANS.length), SLOGAN_MS);
    return () => clearInterval(timer);
  }, []);

  const slogan = SLOGANS[index] ?? SLOGANS[0];

  return (
    <aside className="relative flex min-h-72 flex-col items-center justify-center overflow-hidden bg-brand px-6 py-12 text-ink-inverse lg:min-h-screen">
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        {[0, 1, 2, 3].map((ring) => (
          <span key={ring} className="dg-ring col-start-1 row-start-1" style={{ animationDelay: `${ring * 2.25}s` }} />
        ))}
      </div>

      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <Image src="/logo.svg" alt="DigiGate" width={280} height={89} unoptimized priority className="dg-logo-reversed h-auto w-52 lg:w-72" />

        <div aria-hidden="true" className="mt-10 flex min-h-40 flex-col items-center lg:mt-14">
          <div key={index} className="dg-slogan flex flex-col items-center gap-5">
            {slogan ? (
              <>
                <span className="grid size-14 place-items-center rounded-pill bg-tile-sky text-brand">
                  <Icon name={slogan.icon} className="size-7" />
                </span>
                <p className="font-display text-2xl font-semibold tracking-tight lg:text-3xl">{slogan.text}</p>
              </>
            ) : null}
          </div>
        </div>

        <div aria-hidden="true" className="mt-8 flex gap-2">
          {SLOGANS.map((item, dot) => (
            <span key={item.text} className={`h-1.5 rounded-pill transition-all duration-500 ${dot === index ? "w-6 bg-tile-sky" : "w-1.5 bg-tile-sky/35"}`} />
          ))}
        </div>
      </div>
    </aside>
  );
}
