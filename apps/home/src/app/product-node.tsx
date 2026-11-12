"use client";

import Image from "next/image";
import type { CSSProperties, MouseEvent } from "react";

import { nameParts, type Product } from "@/products";

import { TALL, WIDE } from "./stage-layout";

/*
 * One product on the stage: its mark in a disc at the end of its beam, with its name underneath. A live product is a
 * link to its sign-in; one that isn't out yet is a button that says so.
 */

type Props = {
  product: Product;
  /** Its place in the list, which staggers the launch out of the core. */
  index: number;
  /** This is the product being hovered or focused. */
  current: boolean;
  lastUsed: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  /** A live product has been clicked. The handler may hold the click back briefly to finish its chime. */
  onSelect: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** A product that isn't out yet has been clicked. */
  onSoon: () => void;
};

export function ProductNode({ product, index, current, lastUsed, onActivate, onDeactivate, onSelect, onSoon }: Props) {
  const [family, own] = nameParts(product.name);
  const place = {
    "--i": index,
    "--x-wide": WIDE.products[product.id].x,
    "--y-wide": WIDE.products[product.id].y,
    "--x-tall": TALL.products[product.id].x,
    "--y-tall": TALL.products[product.id].y,
  } as CSSProperties;

  const hover = { onPointerEnter: onActivate, onPointerLeave: onDeactivate, onFocus: onActivate, onBlur: onDeactivate };

  const body = (
    <>
      <span className="node-disc">
        <span className="node-orbit" aria-hidden="true" />
        <Image className="node-mark" src={product.mark} alt="" width={96} height={96} priority unoptimized />
        {lastUsed ? <span className="node-badge">Last used</span> : null}
      </span>
      <span className="node-label">
        <span className="node-name">
          {family}
          <b>{own}</b>
        </span>
        <span className="node-heading">{product.heading}</span>
        <span className="sr-only">{product.summary}</span>
        {product.status === "live" ? (
          <span className="node-chip">
            Sign in
            <svg viewBox="0 0 16 16" aria-hidden="true" className="node-chip-icon">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
            </svg>
          </span>
        ) : (
          <span className="node-chip">Coming soon</span>
        )}
      </span>
    </>
  );

  return (
    <li className="node" data-product={product.id} data-status={product.status} data-current={current} style={place}>
      {product.status === "live" ? (
        <a className="node-hit" href={product.href} onClick={onSelect} {...hover}>
          {body}
        </a>
      ) : (
        <button type="button" className="node-hit" onClick={onSoon} {...hover}>
          {body}
        </button>
      )}
    </li>
  );
}
