"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/*
 * The welcome screen. Browsers only allow sound after a click or tap, which is why it asks for one: pressing Enter
 * is what lets the greeting be heard.
 */

const WORDS = ["Welcome", "to", "the", "Digi", "platform"];

export function Welcome({ leaving, onEnter }: { leaving: boolean; onEnter: () => void }) {
  const enter = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    enter.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="welcome" data-leaving={leaving} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <div className="welcome-marks" aria-hidden="true">
          <Image className="welcome-mark" src="/brand/digilog360-mark.svg" alt="" width={1024} height={1024} priority unoptimized />
          <span className="welcome-divider" />
          <Image className="welcome-mark welcome-mark-gate" src="/brand/digigate-mark-light.svg" alt="" width={432} height={432} priority unoptimized />
        </div>

        <p className="welcome-eyebrow">Netstream Integrated Solutions</p>
        <h1 id="welcome-title" className="welcome-title">
          {WORDS.map((word, index) => (
            <span key={word} className="welcome-word" style={{ animationDelay: `${220 + index * 110}ms` }}>
              {word}
            </span>
          ))}
        </h1>
        <p className="welcome-lead">DigiLog360 and DigiGate, in one place.</p>

        <button ref={enter} type="button" className="welcome-enter" onClick={onEnter} disabled={leaving}>
          Enter
          <svg viewBox="0 0 16 16" aria-hidden="true" className="welcome-enter-icon">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
          </svg>
        </button>
        <p className="welcome-hint" aria-hidden="true">
          or press <kbd>Enter</kbd>
        </p>
      </div>
    </div>
  );
}
