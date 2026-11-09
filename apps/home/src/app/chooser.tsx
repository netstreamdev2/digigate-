"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type MouseEvent } from "react";

import type { Product, ProductId } from "@/products";

import { ProductCard } from "./product-card";
import { hoverChime, readSound, selectChime, soundOnChime, subscribeSound, wakeAudio, welcomeChime, writeSound } from "./sound";
import { playWelcomeVoice, prepareWelcomeVoice, stopWelcomeVoice } from "./welcome-voice";
import { Welcome } from "./welcome";
import { markWelcomed, readWelcomed, subscribeWelcomed } from "./welcome-state";

/** How long a picked card's chime plays before the browser moves on to that product's sign-in. */
const CHIME_BEFORE_LEAVING_MS = 260;
/** How long the welcome takes to fade away, matching its exit animation. */
const WELCOME_EXIT_MS = 900;
/** The chime starts first; the voice comes in just after it. */
const VOICE_AFTER_CHIME_MS = 350;

/** The two arcs of the DigiLog360 mark, drawn as a ring that turns slowly round the emblem. */
function Orbit() {
  return (
    <svg className="orbit" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M100 8 A92 92 0 0 1 188 72" />
      <path d="M190.4 79.6 L193.1 68.3 L181.7 71.9 Z" className="orbit-head" />
      <path d="M100 192 A92 92 0 0 1 12 128" />
      <path d="M9.6 120.4 L18.3 128.1 L6.9 131.7 Z" className="orbit-head" />
    </svg>
  );
}

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

export function Chooser({ products }: { products: Product[] }) {
  const [active, setActive] = useState<ProductId | null>(null);
  const activeRef = useRef<ProductId | null>(null);
  const soundOn = useSyncExternalStore(subscribeSound, readSound, () => "on") === "on";
  const welcomed = useSyncExternalStore(subscribeWelcomed, readWelcomed, () => false);
  const [leaving, setLeaving] = useState(false);
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

  const clear = () => {
    activeRef.current = null;
    setActive(null);
  };

  const leaveList = (event: FocusEvent<HTMLUListElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node && event.currentTarget.contains(next))) clear();
  };

  const select = (product: Product, event: MouseEvent<HTMLAnchorElement>) => {
    if (!soundOn || !isPlainClick(event)) return;
    event.preventDefault();
    selectChime(product.id);
    window.setTimeout(() => window.location.assign(product.href), CHIME_BEFORE_LEAVING_MS);
  };

  const toggleSound = () => {
    const next = soundOn ? "off" : "on";
    writeSound(next);
    if (next === "on") soundOnChime();
    else stopWelcomeVoice();
  };

  const enter = () => {
    setLeaving(true);
    if (soundOn) {
      welcomeChime();
      window.setTimeout(playWelcomeVoice, VOICE_AFTER_CHIME_MS);
    }
    window.setTimeout(() => {
      markWelcomed();
      setLeaving(false);
    }, WELCOME_EXIT_MS);
  };

  const activeProduct = products.find((product) => product.id === active) ?? null;

  return (
    <div className="stage" data-active={active ?? "none"} data-phase={phase}>
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

      {welcomed ? null : <Welcome leaving={leaving} onEnter={enter} />}

      <main className="main" inert={phase === "welcome"}>
        <section className="hero">
          <div className="emblem">
            <Orbit />
            {products.map((product) => (
              <Image
                key={product.id}
                className="emblem-mark"
                data-product={product.id}
                src={product.mark}
                alt={product.id === (activeProduct ?? products[0]).id ? product.name : ""}
                width={432}
                height={432}
                priority
                unoptimized
              />
            ))}
          </div>
          <p className="eyebrow">
            <span className="eyebrow-text" data-for="none" aria-hidden={active !== null}>
              Netstream Integrated Solutions
            </span>
            {products.map((product) => (
              <span key={product.id} className="eyebrow-text" data-for={product.id} aria-hidden={active !== product.id}>
                {product.tagline}
              </span>
            ))}
          </p>
          <h1 className="title">Where are you signing in?</h1>
          <p className="lead">Choose a product to go to its sign-in page.</p>
        </section>

        <ul className="cards" aria-label="Products" onPointerLeave={clear} onBlur={leaveList}>
          {products.map((product, index) => (
            <li key={product.id} className="cards-item" style={{ "--i": index } as CSSProperties}>
              <ProductCard
                product={product}
                onActivate={() => activate(product.id)}
                onSelect={(event) => select(product, event)}
              />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
