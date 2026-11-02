import { vehicleBodyFromDisc, type VehicleBody } from '@digigate/core';

// Neutral grey drawings of the body shape only. A drawing of a specific model or paint colour that the car doesn't
// quite match (an older Hilux, an orange that comes out red) could make a guard think a genuine car is stolen.
const BODY_ART: Record<VehicleBody, number> = {
  hatchback: require('@digigate/design/vehicles/generic-hatchback-neutral.webp'),
  sedan: require('@digigate/design/vehicles/generic-sedan-neutral.webp'),
  'suv-small': require('@digigate/design/vehicles/generic-suv-small-neutral.webp'),
  'suv-large': require('@digigate/design/vehicles/generic-suv-large-neutral.webp'),
  mpv: require('@digigate/design/vehicles/generic-mpv-neutral.webp'),
  'bakkie-single-cab': require('@digigate/design/vehicles/generic-bakkie-single-cab-neutral.webp'),
  'bakkie-double-cab': require('@digigate/design/vehicles/generic-bakkie-double-cab-neutral.webp'),
  minibus: require('@digigate/design/vehicles/generic-minibus-neutral.webp'),
  'panel-van': require('@digigate/design/vehicles/generic-panel-van-neutral.webp'),
  'truck-light': require('@digigate/design/vehicles/generic-truck-light-neutral.webp'),
  'truck-heavy': require('@digigate/design/vehicles/generic-truck-heavy-neutral.webp'),
  motorbike: require('@digigate/design/vehicles/generic-motorbike-neutral.webp'),
};

/** The drawing for a disc's description, or null when the description doesn't name one body shape. */
export function vehicleArtFor(description: string): number | null {
  const body = vehicleBodyFromDisc(description);
  return body ? BODY_ART[body] : null;
}
