/**
 * A company's colour, turned into the few values the dashboard repaints with once you're inside that company: the
 * accent for buttons and icons, and the soft wash behind the glass. Whatever colour a logo has, the accent is darkened
 * until white text on it, and it as text on white, both pass WCAG AA (4.5:1), so a pale logo never makes a page
 * unreadable.
 */

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

const HEX = /^#[0-9a-f]{6}$/i;

export const isBrandColor = (value: string) => HEX.test(value);

function rgbOf(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexOf({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0")).join("")}`;
}

export function hslOf({ r, g, b }: Rgb): Hsl {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return { h: h * 60, s, l };
}

function rgbFromHsl({ h, s, l }: Hsl): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: channel(hue + 1 / 3) * 255, g: channel(hue) * 255, b: channel(hue - 1 / 3) * 255 };
}

function luminance({ r, g, b }: Rgb): number {
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Contrast against white, from 1 to 21. */
export const contrastOnWhite = (rgb: Rgb) => 1.05 / (luminance(rgb) + 0.05);

const AA = 4.5;

/** The company's colour, darkened only as far as it must be to read on white. */
export function accentOf(hex: string): string {
  const hsl = hslOf(rgbOf(hex));
  let { l } = hsl;
  while (l > 0 && contrastOnWhite(rgbFromHsl({ ...hsl, l })) < AA) l -= 0.01;
  return hexOf(rgbFromHsl({ ...hsl, l: Math.max(0, l) }));
}

const rgba = ({ r, g, b }: Rgb, alpha: number) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;

/** A colour beside the company's on the wheel, kept bright enough to glow behind glass. */
function neighbour(hsl: Hsl, turn: number): Rgb {
  return rgbFromHsl({ h: hsl.h + turn, s: Math.max(0.45, hsl.s), l: Math.min(0.62, Math.max(0.5, hsl.l)) });
}

/** The CSS variables a company's pages repaint with. Read by globals.css through the same names as the design tokens. */
export function companyThemeCss(hex: string): string {
  const base = rgbOf(hex);
  const hsl = hslOf(base);
  const glow = rgbFromHsl({ ...hsl, l: Math.min(0.6, Math.max(0.45, hsl.l)) });
  const values = {
    "--dg-color-brand": accentOf(hex),
    "--dg-company": hex,
    "--dg-company-glow": rgba(glow, 0.32),
    "--dg-glass-wash-sky": rgba(glow, 0.4),
    "--dg-glass-wash-lilac": rgba(neighbour(hsl, 38), 0.26),
    "--dg-glass-wash-mint": rgba(neighbour(hsl, -42), 0.2),
  };
  return `:root{${Object.entries(values)
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
}
