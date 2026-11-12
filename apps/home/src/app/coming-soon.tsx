"use client";

import { useEffect, type CSSProperties } from "react";

import { nameParts, type Product } from "@/products";

/*
 * What a product that isn't out yet says when it's clicked: its name, then "Coming soon" arriving a letter at a
 * time out of a burst of sparks, over the middle of the stage. It goes by itself, or at a click or the Escape key.
 */

/** How long it stays, matching the fade written in the stylesheet. */
const SHOWN_FOR_MS = 3200;
const WORDS = "Coming soon";
const SPARKS = 16;

export function ComingSoon({ product, onDone }: { product: Product; onDone: () => void }) {
  const [family, own] = nameParts(product.name);

  useEffect(() => {
    const timer = window.setTimeout(onDone, SHOWN_FOR_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  return (
    <div className="soon" data-product={product.id} role="status" onClick={onDone}>
      <span className="sr-only">{`${product.name} is coming soon.`}</span>

      <span className="soon-burst" aria-hidden="true">
        <span className="soon-ring" />
        <span className="soon-ring" />
        {Array.from({ length: SPARKS }, (_, index) => (
          <span key={index} className="soon-spark" style={{ "--a": `${(360 / SPARKS) * index}deg` } as CSSProperties} />
        ))}
      </span>

      <p className="soon-name" aria-hidden="true">
        {family}
        <b>{own}</b>
      </p>
      <p className="soon-word" aria-hidden="true">
        {Array.from(WORDS, (letter, index) => (
          <span key={index} className="soon-letter" style={{ "--n": index } as CSSProperties}>
            {letter === " " ? " " : letter}
          </span>
        ))}
      </p>
      <p className="soon-note" aria-hidden="true">
        We&apos;re building it. This is where you&apos;ll sign in.
      </p>
    </div>
  );
}
