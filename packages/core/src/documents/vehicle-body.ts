/** Body shapes the gate app can draw, one neutral grey drawing each. Never a model or a paint colour. */
export type VehicleBody =
  | 'hatchback'
  | 'sedan'
  | 'suv-small'
  | 'suv-large'
  | 'mpv'
  | 'bakkie-single-cab'
  | 'bakkie-double-cab'
  | 'minibus'
  | 'panel-van'
  | 'truck-light'
  | 'truck-heavy'
  | 'motorbike';

/**
 * Disc descriptions seen on real discs, keyed by their normalised text. Add one only after seeing it on a real disc:
 * a wrong shape could make a guard doubt a genuine car, and a description not listed falls back to a plain icon.
 */
const BODY_BY_DESCRIPTION: ReadonlyMap<string, VehicleBody> = new Map([['HATCH BACK / LUIKRUG', 'hatchback']]);

const normalise = (description: string) => description.trim().replace(/\s+/g, ' ').toUpperCase();

/** The body shape for a disc's description, e.g. "Hatch back / Luikrug", or null when it isn't a known one. */
export function vehicleBodyFromDisc(description: string): VehicleBody | null {
  return BODY_BY_DESCRIPTION.get(normalise(description)) ?? null;
}
