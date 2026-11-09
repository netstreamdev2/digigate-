import type { CSSProperties } from "react";

/**
 * What a figure is about, which sets its colour on every page: entries green, exits purple, problems red, warnings
 * amber, and everything else DigiGate blue. A problem or warning tile only takes its colour when there is something
 * to see: red over a zero would teach a control room to ignore red.
 */
export type TileMeaning = "entry" | "exit" | "problem" | "warning" | "neutral";

const PALETTE: Record<TileMeaning, { colour: string; soft: string; chip: string }> = {
  entry: { colour: "var(--dg-color-clear)", soft: "var(--dg-color-clear-soft)", chip: "bg-clear text-ink-inverse" },
  exit: { colour: "var(--dg-color-exit)", soft: "var(--dg-color-exit-soft)", chip: "bg-exit text-ink-inverse" },
  problem: { colour: "var(--dg-color-blocked)", soft: "var(--dg-color-blocked-soft)", chip: "bg-blocked text-ink-inverse" },
  warning: { colour: "var(--dg-color-warning)", soft: "var(--dg-color-warning-soft)", chip: "bg-warning text-ink-inverse" },
  neutral: { colour: "var(--dg-color-brand)", soft: "var(--dg-color-tile-sky)", chip: "bg-tile-sky text-brand" },
};

/** The tile's top edge and wash (globals.css .dg-tile), and the class for its icon chip. */
export function tileColour(meaning: TileMeaning): { style: CSSProperties; chip: string } {
  const { colour, soft, chip } = PALETTE[meaning];
  return { style: { "--dg-tile-colour": colour, "--dg-tile-soft": soft } as CSSProperties, chip };
}

/** A problem tile that is only red while its count is above zero. */
export const problemWhen = (count: number): TileMeaning => (count > 0 ? "problem" : "neutral");

/** A warning tile that is only amber while its count is above zero. */
export const warningWhen = (count: number): TileMeaning => (count > 0 ? "warning" : "neutral");
