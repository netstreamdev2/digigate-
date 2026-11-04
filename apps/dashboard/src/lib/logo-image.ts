import { hexOf, hslOf } from "./company-theme";

/**
 * A logo picked in the browser, made ready to keep: drawn onto a canvas no bigger than it needs to be and saved as
 * WebP (or PNG where the browser can't write WebP). Drawing it means an SVG arrives as plain pixels, so nothing that
 * runs can ride in with it. Its colour is read off the same pixels.
 */

export const LOGO_MAX_BYTES = 300_000;
const SIDES = [512, 384, 256];
const SAMPLE = 48;

export type PreparedLogo = { blob: Blob; type: "image/webp" | "image/png"; color: string | null };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    image.src = url;
  });
}

function canvasOf(image: HTMLImageElement, side: number): HTMLCanvasElement {
  // An SVG without a size of its own reports nothing, so it's drawn square.
  const width = image.naturalWidth || side;
  const height = image.naturalHeight || side;
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const blobOf = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));

/**
 * The logo's own colour: the most common strong hue among its solid pixels, ignoring white, black and greys. Null for a
 * logo that's only those, which keeps DigiGate's colours.
 */
export function dominantColor(pixels: Uint8ClampedArray): string | null {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const [r = 0, g = 0, b = 0, a = 0] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 200) continue;
    const { h, s, l } = hslOf({ r, g, b });
    if (s < 0.25 || l < 0.1 || l > 0.92) continue;
    const key = Math.round(h / 15) % 24;
    const weight = s * (1 - Math.abs(l - 0.5));
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  let best: { weight: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.weight > best.weight) best = bucket;
  if (!best || best.weight === 0) return null;
  return hexOf({ r: best.r / best.weight, g: best.g / best.weight, b: best.b / best.weight });
}

/** Throws with a message fit for the screen when the file can't be used. */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture. Pick a PNG, JPG, WebP or SVG file.");
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    throw new Error("That picture couldn't be opened. Try saving it as a PNG first.");
  }

  const sample = canvasOf(image, SAMPLE);
  const context = sample.getContext("2d");
  const color = context ? dominantColor(context.getImageData(0, 0, sample.width, sample.height).data) : null;

  for (const side of SIDES) {
    const canvas = canvasOf(image, side);
    const webp = await blobOf(canvas, "image/webp");
    const blob = webp?.type === "image/webp" ? webp : await blobOf(canvas, "image/png");
    if (blob && blob.size <= LOGO_MAX_BYTES) return { blob, type: blob.type === "image/webp" ? "image/webp" : "image/png", color };
  }
  throw new Error("That logo is too detailed to keep small. Try a simpler version of it.");
}
