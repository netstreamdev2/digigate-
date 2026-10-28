import type { EpochMs } from './rules/types';

/** Things that happen at a gate device. Append-only: events are never edited, only added. */
export type GateEventType = 'sign_in' | 'sign_in_failed' | 'locked_out' | 'lock' | 'unlock' | 'sign_out';

export type GateEventPayload = Readonly<Record<string, string | number | boolean | null>>;

export type GateEvent = {
  /** UUIDv7 made on the device, so an upload retried after a timeout is still one event. */
  id: string;
  type: GateEventType;
  occurredAt: EpochMs;
  gateUserId: string | null;
  payload: GateEventPayload;
};
