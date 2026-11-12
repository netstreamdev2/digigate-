"use client";

import { useEffect, useRef } from "react";

/*
 * The 360 at the centre of the platform, which every product points out from.
 *
 * Until the visitor enters, the core is the way in: browsers only allow sound after a click or key press, so pressing
 * it is also what lets the greeting be heard. Once pressed it counts up to 360 while its dial sweeps a full turn.
 */

/** A tick every five degrees round the dial, with a longer one every thirty. */
const TICKS = Array.from({ length: 72 }, (_, index) => index * 5);
const MAJOR_EVERY = 30;

type Props = {
  /** The visitor hasn't entered yet, so the core offers the way in. */
  showEnter: boolean;
  /** Enter has been pressed and the way in is fading out. */
  leaving: boolean;
  onEnter: () => void;
};

export function Core({ showEnter, leaving, onEnter }: Props) {
  const enter = useRef<HTMLButtonElement>(null);

  // So the Enter key works straight away.
  useEffect(() => {
    enter.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="core">
      <span className="core-halo" aria-hidden="true" />
      <span className="core-ripple" aria-hidden="true" />
      <span className="core-ripple" aria-hidden="true" />
      <span className="core-ripple" aria-hidden="true" />

      <svg className="core-dial" viewBox="0 0 200 200" aria-hidden="true">
        {TICKS.map((degrees) => {
          const major = degrees % MAJOR_EVERY === 0;
          return (
            <line
              key={degrees}
              className="core-tick"
              data-major={major}
              x1="100"
              y1="3"
              x2="100"
              y2={major ? 13 : 8}
              transform={`rotate(${degrees} 100 100)`}
            />
          );
        })}
      </svg>

      {/* The two arcs of the DigiLog360 mark, turning slowly round the core. */}
      <svg className="core-arcs" viewBox="0 0 200 200" aria-hidden="true">
        <path d="M100 8 A92 92 0 0 1 188 72" />
        <path d="M190.4 79.6 L193.1 68.3 L181.7 71.9 Z" className="core-arc-head" />
        <path d="M100 192 A92 92 0 0 1 12 128" />
        <path d="M9.6 120.4 L18.3 128.1 L6.9 131.7 Z" className="core-arc-head" />
      </svg>

      <span className="core-sweep" aria-hidden="true" />
      <span className="core-shock" aria-hidden="true" />

      <div className="core-disc">
        <div className="core-readout" role="img" aria-label="Digi 360">
          <span className="core-brand" aria-hidden="true">
            Digi
          </span>
          {/* The number is drawn by the stylesheet, which is what lets it count up without any script. */}
          <span className="core-count" aria-hidden="true" />
        </div>

        {showEnter ? (
          <button ref={enter} type="button" className="core-enter" onClick={onEnter} disabled={leaving}>
            <span className="core-enter-word">Enter</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="core-enter-icon">
              <path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
