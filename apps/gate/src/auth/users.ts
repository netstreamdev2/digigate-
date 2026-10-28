import type { PinHash } from './pin';

export type GateUser = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  role: 'guard' | 'supervisor';
  pin: PinHash;
  /** Deactivated users stay on the device so the change arrives, but can't sign in. */
  active: boolean;
};

export function isGateUserRole(value: string): value is GateUser['role'] {
  return value === 'guard' || value === 'supervisor';
}
