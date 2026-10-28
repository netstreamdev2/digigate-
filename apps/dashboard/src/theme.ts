import { colors, radius, seriesColors, shadow } from "@digigate/design";

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// Design tokens as CSS variables, so Tailwind's theme (globals.css) reads the same values as the gate app.
export const themeCss = `:root{${[
  ...Object.entries(colors).map(([name, value]) => `--dg-color-${kebab(name)}:${value}`),
  ...seriesColors.map((value, index) => `--dg-color-series-${index + 1}:${value}`),
  ...Object.entries(radius).map(([name, value]) => `--dg-radius-${name}:${value}px`),
  ...Object.entries(shadow).map(([name, value]) => `--dg-shadow-${kebab(name)}:${value}`),
].join(";")}}`;
