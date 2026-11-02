// The made-up people and cars the simulator sends through a gate, and how often things go wrong. Every plate and VIN
// starts with SIM so nothing here can be mistaken for a real vehicle.
import { createHmac } from 'node:crypto';

const DAY = 86_400_000;

export type FakePerson = {
  key: string;
  initials: string;
  names: string;
  surname: string;
  sex: 'male' | 'female';
  birthDate: string;
  licenceExpiresOn: string;
  document: 'smart-id' | 'driver-licence' | 'green-id-book';
  staff: boolean;
};

export type FakeCar = {
  vin: string;
  plate: string;
  discNumber: string;
  registerNumber: string;
  make: string;
  model: string;
  colour: string;
  discExpiresOn: string;
};

/** Trouble per exit or arrival, close to a quiet real site. Live mode raises it so there's something to watch. */
export const TROUBLE = {
  strangerDriving: 0.004,
  otherCarsDriver: 0.003,
  walkedInDrivingOut: 0.002,
  plateTypo: 0.005,
  ignitionFailed: 0.002,
  bootProblem: 0.001,
  fewerOccupantsOut: 0.03,
  noEntryRecord: 0.002,
  doubleEntry: 0.003,
  clonedDisc: 0.001,
  noEntryOnFoot: 0.005,
  doubleEntryOnFoot: 0.003,
  driverLeavesOnFoot: 0.003,
} as const;

export const LIVE_TROUBLE_FACTOR = 12;

/** Arrivals an hour across the site, midnight first: staff at shift change, visitors through the day. */
export const ARRIVALS_PER_HOUR = [3, 2, 2, 2, 3, 10, 34, 38, 26, 20, 22, 26, 26, 24, 22, 24, 30, 34, 26, 16, 10, 7, 5, 4] as const;

export const CAR_SHARE_OF_ARRIVALS = 0.6;

/** How long each visit type stays, in minutes. */
export const STAY_MINUTES: Readonly<Record<string, readonly [number, number]>> = {
  visitor: [30, 120],
  staff: [480, 660],
  delivery: [15, 45],
  contractor: [120, 480],
  patient_dropoff: [5, 20],
  emergency: [30, 240],
};

export const OVERRIDE_REASONS = [
  'Owner came to the gate with the keys',
  'Confirmed with the driver by phone',
  'Hospital fleet vehicle, cleared with duty manager',
  'Guard misread the plate, checked again',
] as const;

const FIRST_NAMES = [
  'THABO', 'LERATO', 'SIPHO', 'NALEDI', 'JOHAN', 'FATIMA', 'PIETER', 'ZANELE', 'BONGANI', 'CHANTEL', 'KAGISO', 'ANNELIZE',
  'DUMISANI', 'RESHMA', 'ANELE', 'MARIA',
] as const;
const SURNAMES = [
  'DLAMINI', 'NKOSI', 'MOKOENA', 'BOTHA', 'NAIDOO', 'VAN WYK', 'MTHEMBU', 'PILLAY', 'JACOBS', 'KHUMALO', 'NDLOVU', 'FOURIE',
  'SITHOLE', 'ADAMS', 'MASEKO', 'PRETORIUS', 'ZULU', 'MAHLANGU', 'SMIT', 'MOLEFE',
] as const;
const CARS = [
  ['TOYOTA', 'COROLLA'], ['TOYOTA', 'HILUX'], ['TOYOTA', 'FORTUNER'], ['VOLKSWAGEN', 'POLO'], ['FORD', 'RANGER'], ['HYUNDAI', 'I20'],
  ['SUZUKI', 'SWIFT'], ['NISSAN', 'NP200'], ['KIA', 'PICANTO'], ['BMW', '320I'], ['MERCEDES-BENZ', 'C200'], ['ISUZU', 'D-MAX'],
] as const;
const COLOURS = ['WHITE', 'SILVER', 'GREY', 'BLACK', 'RED', 'BLUE'] as const;

export const chance = (probability: number): boolean => Math.random() < probability;
export const between = (low: number, high: number): number => low + Math.random() * (high - low);
export const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

function required<T>(list: readonly T[]): T {
  const item = pick(list);
  if (item === undefined) throw new Error('Nothing to pick from.');
  return item;
}

const isoDate = (at: number): string => new Date(at).toISOString().slice(0, 10);
const padded = (value: number, width: number): string => String(value).padStart(width, '0');

// The same shape of key the handheld makes, so a person matches across every event.
function personKey(secretHex: string, number: number): string {
  return createHmac('sha256', Buffer.from(secretHex, 'hex')).update(`02:SIM${padded(number, 6)}`).digest('hex');
}

export function makePeople(count: number, secretHex: string, now: number): FakePerson[] {
  return Array.from({ length: count }, (_unused, index) => {
    const names = required(FIRST_NAMES);
    return {
      key: personKey(secretHex, index),
      initials: names.slice(0, 1),
      names,
      surname: required(SURNAMES),
      sex: chance(0.5) ? 'male' : 'female',
      birthDate: isoDate(now - between(18, 75) * 365 * DAY),
      // A few drivers let their licence lapse.
      licenceExpiresOn: isoDate(now + (chance(0.01) ? -between(1, 200) : between(30, 1800)) * DAY),
      document: chance(0.75) ? 'smart-id' : chance(0.8) ? 'driver-licence' : 'green-id-book',
      staff: chance(0.2),
    };
  });
}

export function makeCar(number: number, now: number): FakeCar {
  const [make, model] = required(CARS);
  return {
    vin: `SIMVIN${padded(number, 11)}`,
    plate: `SIM ${padded(number, 4)} GP`,
    discNumber: `SIMD${padded(number, 8)}`,
    registerNumber: `SIMR${padded(number, 6)}`,
    make,
    model,
    colour: required(COLOURS),
    // A few discs have run out.
    discExpiresOn: isoDate(now + (chance(0.02) ? -between(1, 120) : between(10, 360)) * DAY),
  };
}
