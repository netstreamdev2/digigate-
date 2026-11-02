import { normaliseIdentifier } from '../identifiers';
import type { LicenceDisc, OpenVehicleVisit, OpenVisit, VehicleIdentity, VehicleSighting } from './types';

// A car entered by hand has no disc to scan, so its VIN, disc number and expiry are empty. Empty means unknown: two
// unknown values are never "the same", and an unknown value is never "different" either.

const known = (value: string) => normaliseIdentifier(value) !== '';

export function vehicleVisits(visits: readonly OpenVisit[]): OpenVehicleVisit[] {
  return visits.filter((visit): visit is OpenVehicleVisit => visit.kind === 'vehicle');
}

export function sameVin(a: { vin: string }, b: { vin: string }): boolean {
  return known(a.vin) && normaliseIdentifier(a.vin) === normaliseIdentifier(b.vin);
}

function differentVin(a: { vin: string }, b: { vin: string }): boolean {
  return known(a.vin) && known(b.vin) && normaliseIdentifier(a.vin) !== normaliseIdentifier(b.vin);
}

export function samePlate(a: { plate: string }, b: { plate: string }): boolean {
  return normaliseIdentifier(a.plate) === normaliseIdentifier(b.plate);
}

function sameDiscNumber(a: VehicleIdentity, b: VehicleIdentity): boolean {
  return known(a.discNumber) && normaliseIdentifier(a.discNumber) === normaliseIdentifier(b.discNumber);
}

/** The same car: by VIN when both are known, otherwise by plate. */
export function sameVehicle(a: VehicleIdentity, b: VehicleIdentity): boolean {
  return known(a.vin) && known(b.vin) ? sameVin(a, b) : known(a.plate) && samePlate(a, b);
}

/**
 * Whether a car leaving carries a different disc from the one scanned when it came in: an old disc, or one copied from
 * another car, put on while it was inside. Only what was known both times is compared.
 */
export function discChangedSince(visit: OpenVehicleVisit, disc: LicenceDisc): boolean {
  const discNumberChanged = known(visit.vehicle.discNumber) && known(disc.discNumber) && !sameDiscNumber(visit.vehicle, disc);
  const expiryChanged = visit.discExpiresOn !== undefined && disc.expiresOn !== '' && visit.discExpiresOn !== disc.expiresOn;
  return !samePlate(visit.vehicle, disc) || discNumberChanged || expiryChanged;
}

/**
 * Another car on site that shares this car's VIN or disc number under a different plate,
 * or its plate under a different VIN. One of the two is carrying copied documents or plates.
 */
export function findCloneOnSite(
  vehicle: VehicleIdentity,
  visits: readonly OpenVisit[],
  excludeVisitId?: string,
): OpenVehicleVisit | undefined {
  return vehicleVisits(visits).find((visit) => {
    if (visit.id === excludeVisitId) return false;
    const other = visit.vehicle;
    const sharesDocuments = (sameVin(other, vehicle) || sameDiscNumber(other, vehicle)) && !samePlate(other, vehicle);
    const sharesPlate = samePlate(other, vehicle) && differentVin(other, vehicle);
    return sharesDocuments || sharesPlate;
  });
}

export function hasHistoryConflict(vehicle: VehicleIdentity, history: readonly VehicleSighting[]): boolean {
  return history.some(
    (sighting) => (samePlate(sighting, vehicle) && differentVin(sighting, vehicle)) || (sameVin(sighting, vehicle) && !samePlate(sighting, vehicle)),
  );
}
