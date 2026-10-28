import { normaliseIdentifier } from '../identifiers';
import type { OpenVehicleVisit, OpenVisit, VehicleIdentity, VehicleSighting } from './types';

export function vehicleVisits(visits: readonly OpenVisit[]): OpenVehicleVisit[] {
  return visits.filter((visit): visit is OpenVehicleVisit => visit.kind === 'vehicle');
}

export function sameVin(a: { vin: string }, b: { vin: string }): boolean {
  return normaliseIdentifier(a.vin) === normaliseIdentifier(b.vin);
}

export function samePlate(a: { plate: string }, b: { plate: string }): boolean {
  return normaliseIdentifier(a.plate) === normaliseIdentifier(b.plate);
}

function sameDiscNumber(a: VehicleIdentity, b: VehicleIdentity): boolean {
  return normaliseIdentifier(a.discNumber) === normaliseIdentifier(b.discNumber);
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
    const sharesPlate = samePlate(other, vehicle) && !sameVin(other, vehicle);
    return sharesDocuments || sharesPlate;
  });
}

export function hasHistoryConflict(vehicle: VehicleIdentity, history: readonly VehicleSighting[]): boolean {
  return history.some(
    (sighting) =>
      (samePlate(sighting, vehicle) && !sameVin(sighting, vehicle)) ||
      (sameVin(sighting, vehicle) && !samePlate(sighting, vehicle)),
  );
}
