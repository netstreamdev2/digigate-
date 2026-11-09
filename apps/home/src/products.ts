/**
 * The products the landing page offers. Each one signs in on its own address with its own login: this page only
 * points the way, so it holds no sessions, no data and no secrets.
 *
 * The addresses can be changed per deployment without touching code (NEXT_PUBLIC_DIGILOG360_URL and
 * NEXT_PUBLIC_DIGIGATE_URL), for example to point a preview at a test deployment.
 */

export type ProductId = "digilog360" | "digigate";

export type Product = {
  id: ProductId;
  name: string;
  /** Short paths on this site that jump straight to the product, e.g. digilog360.co.za/digigate. */
  shortcuts: string[];
  href: string;
  heading: string;
  summary: string;
  /** Shown above the title while this product's card is hovered. */
  tagline: string;
  logo: { src: string; width: number; height: number };
  /** The product's mark on its own, for the emblem at the top of the page. */
  mark: string;
};

const address = (value: string | undefined, fallback: string) => (value && value.trim() !== "" ? value.trim() : fallback);

export const products: Product[] = [
  {
    id: "digilog360",
    name: "DigiLog360",
    shortcuts: ["/digilog", "/digilog360"],
    href: address(process.env.NEXT_PUBLIC_DIGILOG360_URL, "https://www.digilog360.co.za"),
    heading: "Security operations",
    summary: "Digital occurrence logs for guards, sites and the control room.",
    tagline: "Security operations platform",
    logo: { src: "/brand/digilog360-lockup-horizontal-dark.svg", width: 2400, height: 680 },
    mark: "/brand/digilog360-mark.svg",
  },
  {
    id: "digigate",
    name: "DigiGate",
    shortcuts: ["/digigate"],
    href: address(process.env.NEXT_PUBLIC_DIGIGATE_URL, "https://digigate.digilog360.co.za"),
    heading: "Gate access control",
    summary: "Licence and disc checks at every gate, and who is on site right now.",
    tagline: "Access control for every gate",
    logo: { src: "/brand/digigate-logo-light.svg", width: 1355, height: 432 },
    mark: "/brand/digigate-mark-light.svg",
  },
];

/** The address shown on a card, so people can see where they are about to go. */
export const hostOf = (href: string) => new URL(href).host;
