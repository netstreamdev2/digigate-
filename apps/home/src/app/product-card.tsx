"use client";

import Image from "next/image";
import { useSyncExternalStore, type MouseEvent, type PointerEvent } from "react";

import { hostOf, type Product } from "@/products";

const LAST_USED_KEY = "digilog360.last-product";

// The last product picked is a convenience on this browser only. Storage can be blocked (private windows,
// locked-down browsers), and then the page simply shows no "Last used" badge.
function readLastUsed(): string | null {
  try {
    return window.localStorage.getItem(LAST_USED_KEY);
  } catch {
    return null;
  }
}

function rememberLastUsed(id: string) {
  try {
    window.localStorage.setItem(LAST_USED_KEY, id);
  } catch {
    // Nothing to do: the badge is a nicety, and the link still goes where it should.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Moves the card's soft spotlight to follow the pointer. */
function followPointer(event: PointerEvent<HTMLAnchorElement>) {
  const card = event.currentTarget;
  const box = card.getBoundingClientRect();
  card.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
  card.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
}

type Props = {
  product: Product;
  /** The card has been hovered or focused. */
  onActivate: () => void;
  /** The card has been clicked. The handler may hold the click back briefly to finish its chime. */
  onSelect: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function ProductCard({ product, onActivate, onSelect }: Props) {
  const lastUsed = useSyncExternalStore(subscribe, readLastUsed, () => null);
  const isLastUsed = lastUsed === product.id;

  return (
    <a
      className="card"
      data-product={product.id}
      href={product.href}
      onPointerEnter={onActivate}
      onFocus={onActivate}
      onPointerMove={followPointer}
      onClick={(event) => {
        rememberLastUsed(product.id);
        onSelect(event);
      }}
    >
      <div className="card-top">
        <Image
          className="card-logo"
          src={product.logo.src}
          alt={product.name}
          width={product.logo.width}
          height={product.logo.height}
          priority
          unoptimized
        />
        {isLastUsed ? <span className="badge">Last used</span> : null}
      </div>

      <div className="card-body">
        <h2 className="card-heading">{product.heading}</h2>
        <p className="card-summary">{product.summary}</p>
      </div>

      <div className="card-foot">
        <span className="card-host">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="card-host-icon">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          {hostOf(product.href)}
        </span>
        <span className="card-cta">
          Sign in
          <svg viewBox="0 0 16 16" aria-hidden="true" className="card-cta-icon">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
          </svg>
        </span>
      </div>
    </a>
  );
}
