// Whether a guard is at their post, judged from the device's own GPS, so it needs no connection. GPS drifts, sometimes
// by tens of metres with the device lying still, so no single reading ever counts: a reading has to be good enough to
// trust, and what it says has to hold for a while before anything changes. Nothing here keeps a trail: the state holds
// only where the guard stands now and when that began.

export type Fence = { latitude: number; longitude: number; radiusM: number };

export type Fix = { latitude: number; longitude: number; accuracyM: number; at: number };

export type FenceState = {
  /** The last thing that was confirmed. Starts inside: a shift begins at the post. */
  side: 'inside' | 'outside';
  /** When readings first began to say the opposite, or null while they agree. */
  changingSince: number | null;
};

export type FenceChange = 'left' | 'returned' | null;

/** A reading vaguer than this says nothing useful about a 50 m fence. */
export const WORST_USEFUL_ACCURACY_M = 40;
/** How long readings must agree the guard has gone before anyone is told. */
export const LEAVING_CONFIRMS_AFTER_MS = 60_000;
/** Coming back is quicker to believe: a wrong "returned" only delays the next warning. */
export const RETURNING_CONFIRMS_AFTER_MS = 20_000;

const EARTH_RADIUS_M = 6_371_000;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The distance between two points on the ground, in metres. */
export function distanceMetres(from: Pick<Fix, 'latitude' | 'longitude'>, to: Pick<Fix, 'latitude' | 'longitude'>): number {
  const latitudeGap = radians(to.latitude - from.latitude);
  const longitudeGap = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeGap / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeGap / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Which side a reading puts the guard on, or null when its error margin straddles the fence and it can't say. */
export function sideOfFence(fix: Fix, fence: Fence): FenceState['side'] | null {
  if (fix.accuracyM > WORST_USEFUL_ACCURACY_M) return null;
  const distance = distanceMetres(fix, fence);
  if (distance - fix.accuracyM > fence.radiusM) return 'outside';
  return distance + fix.accuracyM <= fence.radiusM || distance <= fence.radiusM ? 'inside' : null;
}

export const FENCE_START: FenceState = { side: 'inside', changingSince: null };

/**
 * Takes in one reading. While the guard has said they're stepping away, nothing counts until `pausedUntil`: they can be
 * anywhere. When it runs out they're judged afresh, so someone still away is told about after the usual wait.
 */
export function stepFence(state: FenceState, fix: Fix, fence: Fence, pausedUntil: number | null): { state: FenceState; change: FenceChange } {
  if (pausedUntil !== null && fix.at < pausedUntil) return { state: { side: state.side, changingSince: null }, change: null };

  const reading = sideOfFence(fix, fence);
  // A reading that can't say leaves things as they are, so one bad fix neither confirms a move nor cancels it.
  if (reading === null) return { state, change: null };
  if (reading === state.side) return { state: { side: state.side, changingSince: null }, change: null };

  const since = state.changingSince ?? fix.at;
  const needed = reading === 'outside' ? LEAVING_CONFIRMS_AFTER_MS : RETURNING_CONFIRMS_AFTER_MS;
  if (fix.at - since < needed) return { state: { side: state.side, changingSince: since }, change: null };
  return { state: { side: reading, changingSince: null }, change: reading === 'outside' ? 'left' : 'returned' };
}
