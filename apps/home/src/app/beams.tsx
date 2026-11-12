import type { CSSProperties } from "react";

import type { Product, ProductId } from "@/products";

import type { StageLayout } from "./stage-layout";

/*
 * The beams from the core out to each product. A live product's beam carries a pulse of light travelling outwards;
 * one that isn't out yet is a dotted line.
 *
 * The lines are placed in percent with no viewBox, so they are drawn in true pixels at any stage size: nothing is
 * stretched, and a line is the same weight whichever way it runs.
 */

type Props = {
  layout: StageLayout;
  /** Which arrangement this drawing is for; the stylesheet shows the one that fits the screen. */
  variant: "wide" | "tall";
  products: Product[];
  active: ProductId | null;
};

export function Beams({ layout, variant, products, active }: Props) {
  return (
    <svg className="beams" data-variant={variant} aria-hidden="true">
      {products.map((product, index) => {
        const end = layout.products[product.id];
        const line = {
          x1: `${layout.core.x}%`,
          y1: `${layout.core.y}%`,
          x2: `${end.x}%`,
          y2: `${end.y}%`,
          // Lets the dashes be written in hundredths of the line, however long it is on this screen.
          pathLength: 100,
        };
        return (
          <g
            key={product.id}
            className="beam"
            data-product={product.id}
            data-status={product.status}
            data-current={active === product.id}
            style={{ "--i": index } as CSSProperties}
          >
            <line className="beam-line" {...line} />
            {product.status === "live" ? <line className="beam-pulse" {...line} /> : null}
          </g>
        );
      })}
    </svg>
  );
}
