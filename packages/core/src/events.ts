import type { EpochMs } from './rules/types';

/** Things that happen at a gate device. Append-only: events are never edited, only added. */
export type GateEventType =
  | 'sign_in'
  | 'sign_in_failed'
  | 'locked_out'
  | 'lock'
  | 'unlock'
  | 'sign_out'
  /** A guard went on duty at a post. Every event until the matching `shift_end` happened on their watch. */
  | 'shift_start'
  | 'shift_end'
  /** A vehicle was checked at the entry or exit, with every rule hit; written before the result is shown. */
  | 'vehicle_entry'
  | 'vehicle_exit'
  /** A person on foot was checked at the walk-in gate, written before the result is shown. */
  | 'pedestrian_entry'
  | 'pedestrian_exit'
  /** The guard acknowledged warnings and let the vehicle through. */
  | 'alert_ack'
  /** A supervisor let a blocked vehicle through, with a reason. */
  | 'override'
  /** The guard kept the boom closed and sent the vehicle back. */
  | 'turned_away';

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type GateEventPayload = { readonly [key: string]: JsonValue };

export type GateEvent = {
  /** UUIDv7 made on the device, so an upload retried after a timeout is still one event. */
  id: string;
  type: GateEventType;
  occurredAt: EpochMs;
  gateUserId: string | null;
  payload: GateEventPayload;
};
