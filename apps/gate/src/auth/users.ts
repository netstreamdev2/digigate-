import type { PinHash } from './pin';

export type GateUser = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  role: 'guard' | 'supervisor';
  pin: PinHash;
};
