"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

import { hostOf, type Product, type ProductId } from "@/products";

import { Beams } from "./beams";
import { ComingSoon } from "./coming-soon";
import { Core } from "./core";
import { readLastUsed, rememberLastUsed, subscribeLastUsed } from "./last-used";
import { ProductNode } from "./product-node";
import { hoverChime, readSound, selectChime, soonChime, soundOnChime, subscribeSound, wakeAudio, welcomeChime, writeSound } from "./sound";
import { TALL, WIDE } from "./stage-layout";
import { playWelcomeVoice, prepareWelcomeVoice, stopWelcomeVoice } from "./welcome-voice";
import { markWelcomed, readWelcomed, subscribeWelcomed } from "./welcome-state";

/*
 * The whole landing page as one scene: the 360 core in the middle and the products pointing out from it.
 *
 * It has two phases. In "welcome" only the core shows, as the way in. Pressing it powers the platform on: the core
 * counts up to 360, the products launch out to their places and the beams draw out to them. That's "ready". The
 * welcome shows once per browser session.
 */

/** How long a picked product's chime plays before the browser moves on to that product's sign-in. */
const CHIME_BEFORE_LEAVING_MS = 260;
/** How long the way in takes to fade from the core, matching the stylesheet. */
const WELCOME_EXIT_MS = 900;
/** How long the products take to launch out of the core. While it lasts their movements are staggered. */
const LAUNCH_MS = 1900;
/** The chime starts first; the voice comes in just after it. */
const VOICE_AFTER_CHIME_MS = 350;

const TITLE = ["Welcome", "to", "the", "Digi", "platform"];

/** The core's place in both arrangements, handed to the stylesheet. */
const CORE_PLACE = {
  "--cx-wide": WIDE.core.x,
  "--cy-wide": WIDE.core.y,
  "--cx-tall": TALL.core.x,
  "--cy-tall": TALL.core.y,
} as CSSProperties;

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sound-icon">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      {on ? (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18.2 6.5a7.5 7.5 0 0 1 0 11" />
        </>
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

/** Opens a link the ordinary way: a new tab, a middle click or a modified click is never held back for a chime. */
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function Platform({ products }: { products: Product[] }) {
  const [active, setActive] = useState<ProductId | null>(null);
  const activeRef = useRef<ProductId | null>(null);
  const soundOn = useSyncExternalStore(subscribeSound, readSound, () => "on") === "on";
  const welcomed = useSyncExternalStore(subscribeWelcomed, readWelcomed, () => false);
  const lastUsed = useSyncExternalStore(subscribeLastUsed, readLastUsed, () => null);
  const [leaving, setLeaving] = useState(false);
  // Entered on this page view, rather than welcomed earlier in the session: only then does the launch play.
  const [entered, setEntered] = useState(false);
  const [launching, setLaunching] = useState(false);
  // The product whose "coming soon" is showing. The count makes a second click play it again from the start.
  const [soon, setSoon] = useState<{ product: Product; shown: number } | null>(null);
  const pointerFrame = useRef(0);
  const phase = welcomed || leaving ? "ready" : "welcome";

  useEffect(() => {
    prepareWelcomeVoice();
  }, []);

  // Browsers keep audio asleep until the first click or key press on the page, so wake it then.
  useEffect(() => {
    if (!soundOn) return;
    const wake = () => wakeAudio();
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [soundOn]);

  const activate = (id: ProductId) => {
    if (activeRef.current === id) return;
    activeRef.current = id;
    setActive(id);
    if (soundOn) hoverChime(id);
  };

  const deactivate = (id: ProductId) => {
    if (activeRef.current !== id) return;
    activeRef.current = null;
    setActive(null);
  };

  const select = (product: Product & { status: "live" }, event: MouseEvent<HTMLAnchorElement>) => {
    rememberLastUsed(product.id);
    if (!soundOn || !isPlainClick(event)) return;
    event.preventDefault();
    selectChime(product.id);
    window.setTimeout(() => window.location.assign(product.href), CHIME_BEFORE_LEAVING_MS);
  };

  const announceSoon = (product: Product) => {
    if (soundOn) soonChime(product.id);
    setSoon((showing) => ({ product, shown: (showing?.shown ?? 0) + 1 }));
  };

  const dismissSoon = useCallback(() => setSoon(null), []);

  const toggleSound = () => {
    const next = soundOn ? "off" : "on";
    writeSound(next);
    if (next === "on") soundOnChime();
    else stopWelcomeVoice();
  };

  const enter = () => {
    setLeaving(true);
    setEntered(true);
    setLaunching(true);
    if (soundOn) {
      welcomeChime();
      window.setTimeout(playWelcomeVoice, VOICE_AFTER_CHIME_MS);
    }
    window.setTimeout(() => {
      markWelcomed();
      setLeaving(false);
    }, WELCOME_EXIT_MS);
    window.setTimeout(() => setLaunching(false), LAUNCH_MS);
  };

  // The stage's light follows the mouse, and everything on it drifts a little with it. Touch has no hover to follow.
  const followPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const stage = event.currentTarget;
    const { clientX, clientY } = event;
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = requestAnimationFrame(() => {
      const box = stage.getBoundingClientRect();
      const x = clientX - box.left;
      const y = clientY - box.top;
      stage.style.setProperty("--light-x", `${x}px`);
      stage.style.setProperty("--light-y", `${y}px`);
      stage.style.setProperty("--drift-x", ((x / box.width) * 2 - 1).toFixed(3));
      stage.style.setProperty("--drift-y", ((y / box.height) * 2 - 1).toFixed(3));
    });
  };

  const settlePointer = (event: PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(pointerFrame.current);
    event.currentTarget.style.setProperty("--drift-x", "0");
    event.currentTarget.style.setProperty("--drift-y", "0");
  };

  return (
    <div className="platform" data-active={active ?? "none"} data-phase={phase} data-entered={entered} data-launching={launching}>
      <div className="backdrop" aria-hidden="true" />

      <button
        type="button"
        className="sound-toggle"
        aria-label="Sound"
        aria-pressed={soundOn}
        title={soundOn ? "Sound on" : "Sound off"}
        onClick={toggleSound}
      >
        <SoundIcon on={soundOn} />
      </button>

      <main className="main">
        <header className="intro">
          {/* The line above the title changes to the hovered product's. */}
          <p className="eyebrow swap">
            <span data-on={active === null} aria-hidden={active !== null}>
              Netstream Integrated Solutions
            </span>
            {products.map((product) => (
              <span key={product.id} data-on={active === product.id} aria-hidden={active !== product.id}>
                {product.tagline}
              </span>
            ))}
          </p>
          <h1 className="title">
            {TITLE.map((word, index) => (
              <span key={word} className="title-word" style={{ "--i": index } as CSSProperties}>
                {word}
              </span>
            ))}
          </h1>
          <p className="lead">DigiLog360, DigiGate and more, around one core.</p>
        </header>

        <div className="stage" style={CORE_PLACE} onPointerMove={followPointer} onPointerLeave={settlePointer}>
          <Beams layout={WIDE} variant="wide" products={products} active={active} />
          <Beams layout={TALL} variant="tall" products={products} active={active} />

          <Core showEnter={!welcomed} leaving={leaving} onEnter={enter} />

          <nav aria-label="Products" inert={phase === "welcome"}>
            <ul className="nodes">
              {products.map((product, index) => (
                <ProductNode
                  key={product.id}
                  product={product}
                  index={index}
                  current={active === product.id}
                  lastUsed={lastUsed === product.id}
                  onActivate={() => activate(product.id)}
                  onDeactivate={() => deactivate(product.id)}
                  onSelect={(event) => {
                    if (product.status === "live") select(product, event);
                  }}
                  onSoon={() => announceSoon(product)}
                />
              ))}
            </ul>
          </nav>

          {/* Under the core: what the hovered product is. Its name, heading and summary are already on the product itself. */}
          <div className="caption swap" aria-hidden="true">
            <p className="caption-hint" data-on={phase === "welcome"}>
              or press <kbd>Enter</kbd>
            </p>
            <p className="caption-rest" data-on={phase === "ready" && active === null}>
              Choose a product to go to its sign-in.
            </p>
            {products.map((product) => (
              <div key={product.id} className="caption-product" data-product={product.id} data-on={phase === "ready" && active === product.id}>
                <p className="caption-heading">{product.heading}</p>
                <p className="caption-summary">{product.summary}</p>
                <p className="caption-where">
                  {product.status === "live" ? (
                    <>
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="caption-lock">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" />
                        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                      </svg>
                      {hostOf(product.href)}
                    </>
                  ) : (
                    "Coming soon"
                  )}
                </p>
              </div>
            ))}
          </div>

          {soon ? <ComingSoon key={soon.shown} product={soon.product} onDone={dismissSoon} /> : null}
        </div>
      </main>
    </div>
  );
}
