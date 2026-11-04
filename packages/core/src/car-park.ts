/**
 * A site's car park as the gate sees it: how many spaces are free, worked out from the cars inside. It only ever
 * informs. A full car park never stops a scan, because a delivery, an ambulance or a drop-off still has to get in.
 */

/** How a site's parking is set up: open parking keeps no count; otherwise it has this many spaces. */
export type CarPark = { open: boolean; spaces: number | null };

export type CarParkState =
  | { kind: 'unknown' }
  | { kind: 'open'; parked: number }
  | { kind: 'counted'; spaces: number; parked: number; free: number; full: boolean; nearlyFull: boolean };

/** From nine in ten spaces taken, the gate is warned the car park is filling up. */
export const NEARLY_FULL = 0.9;

export function carParkState(park: CarPark | null, parked: number): CarParkState {
  if (!park) return { kind: 'unknown' };
  if (park.open || park.spaces === null || park.spaces <= 0) return { kind: 'open', parked };
  // More cars than spaces happens: cars that left unscanned, or parked on the verge. It reads as full, never as less than nothing free.
  const free = Math.max(0, park.spaces - parked);
  return { kind: 'counted', spaces: park.spaces, parked, free, full: free === 0, nearlyFull: free > 0 && parked >= park.spaces * NEARLY_FULL };
}
