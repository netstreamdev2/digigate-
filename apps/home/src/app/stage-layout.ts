import type { ProductId } from "@/products";

/*
 * Where everything sits on the stage, in percent of its width and height. There are two arrangements: wide screens,
 * and phones held upright. The stylesheet places the core and the products from these numbers and the beams are
 * drawn from the same ones, so a beam always ends exactly under its product.
 */

export type Point = { x: number; y: number };

export type StageLayout = { core: Point; products: Record<ProductId, Point> };

export const WIDE: StageLayout = {
  core: { x: 50, y: 46 },
  products: {
    digilog360: { x: 14, y: 22 },
    digigate: { x: 86, y: 22 },
    digitrack: { x: 14, y: 70 },
    digicomm: { x: 86, y: 70 },
  },
};

export const TALL: StageLayout = {
  core: { x: 50, y: 46 },
  products: {
    digilog360: { x: 21, y: 9 },
    digigate: { x: 79, y: 9 },
    digitrack: { x: 21, y: 76 },
    digicomm: { x: 79, y: 76 },
  },
};
