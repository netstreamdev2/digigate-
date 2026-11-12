/**
 * The products on the Digi platform. Each live one signs in on its own address with its own login: this page only
 * points the way, so it holds no sessions, no data and no secrets. A product that isn't out yet is shown as coming
 * soon and leads nowhere.
 *
 * The addresses can be changed per deployment without touching code (NEXT_PUBLIC_DIGILOG360_URL and
 * NEXT_PUBLIC_DIGIGATE_URL), for example to point a preview at a test deployment.
 */

export type ProductId = "digilog360" | "digigate" | "digitrack" | "digicomm";

type ProductDetails = {
  id: ProductId;
  name: string;
  heading: string;
  summary: string;
  /** Shown above the title while this product is hovered. */
  tagline: string;
  /** The product's mark on its own, square. */
  mark: string;
};

export type LiveProduct = ProductDetails & {
  status: "live";
  href: string;
  /** Short paths on this site that jump straight to the product, e.g. digilog360.co.za/digigate. */
  shortcuts: string[];
};

export type UpcomingProduct = ProductDetails & { status: "soon" };

export type Product = LiveProduct | UpcomingProduct;

const address = (value: string | undefined, fallback: string) => (value && value.trim() !== "" ? value.trim() : fallback);

export const products: Product[] = [
  {
    id: "digilog360",
    status: "live",
    name: "DigiLog360",
    shortcuts: ["/digilog", "/digilog360"],
    href: address(process.env.NEXT_PUBLIC_DIGILOG360_URL, "https://www.digilog360.co.za"),
    heading: "Security operations",
    summary: "Digital occurrence logs for guards, sites and the control room.",
    tagline: "Security operations platform",
    mark: "/brand/digilog360-mark.svg",
  },
  {
    id: "digigate",
    status: "live",
    name: "DigiGate",
    shortcuts: ["/digigate"],
    href: address(process.env.NEXT_PUBLIC_DIGIGATE_URL, "https://digigate.digilog360.co.za"),
    heading: "Gate access control",
    summary: "Licence and disc checks at every gate, and who is on site right now.",
    tagline: "Access control for every gate",
    mark: "/brand/digigate-mark-light.svg",
  },
  {
    id: "digitrack",
    status: "soon",
    name: "DigiTrack",
    heading: "Tracking",
    summary: "On its way. This is where you'll sign in when it lands.",
    tagline: "Coming soon to the Digi platform",
    mark: "/brand/digitrack-mark.svg",
  },
  {
    id: "digicomm",
    status: "soon",
    name: "DigiComm",
    heading: "Communications",
    summary: "On its way. This is where you'll sign in when it lands.",
    tagline: "Coming soon to the Digi platform",
    mark: "/brand/digicomm-mark.svg",
  },
];

/** The address shown for a live product, so people can see where they are about to go. */
export const hostOf = (href: string) => new URL(href).host;

const FAMILY = "Digi";

/** A product's name in two parts, so the family name and the product's own can be set apart: Digi + Gate. */
export const nameParts = (name: string): [string, string] =>
  name.startsWith(FAMILY) ? [FAMILY, name.slice(FAMILY.length)] : [name, ""];
