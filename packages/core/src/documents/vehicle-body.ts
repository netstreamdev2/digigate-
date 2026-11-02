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
 * The words on a disc that name a body shape, in English or Afrikaans, most specific first: a double-cab pick-up is a
 * double cab before it's a pick-up. A description that doesn't name one shape gets no drawing. "Station wagon" stays
 * out on purpose: discs use it for estates and for SUVs alike, and a drawing of the wrong one could make a guard doubt a
 * genuine car.
 */
const BODY_WORDS: readonly (readonly [VehicleBody, RegExp])[] = [
  ['bakkie-double-cab', /DOUBLE ?CAB|D\/CAB|DUBBEL ?KAJUIT/],
  ['bakkie-single-cab', /SINGLE ?CAB|ENKEL ?KAJUIT|PICK[ -]?UP|BAKKIE|OOPBAK/],
  ['panel-van', /PANEL ?VAN|PANEEL ?WA/],
  ['minibus', /MINI[ -]?BUS/],
  ['motorbike', /MOTOR ?CYCLE|MOTORFIETS|SCOOTER/],
  ['truck-heavy', /TRUCK[ -]?TRACTOR|VOORHAKER/],
  ['truck-light', /\bTRUCK\b|VRAGMOTOR|\bLORRY\b/],
  ['mpv', /MULTI[ -]?PURPOSE|\bMPV\b/],
  ['suv-small', /\bSUV\b|SPORT[ -]?UTILITY/],
  ['hatchback', /HATCH ?BACK|LUIKRUG/],
  ['sedan', /SEDAN|SALOON|COUPE|KOEPEE/],
];

const normalise = (description: string) => description.trim().replace(/\s+/g, ' ').toUpperCase();

/** The body shape a disc's description names, e.g. "Hatch back / Luikrug", or null when it doesn't name one. */
export function vehicleBodyFromDisc(description: string): VehicleBody | null {
  const text = normalise(description);
  return BODY_WORDS.find(([, words]) => words.test(text))?.[0] ?? null;
}
