import type { SQLiteDatabase } from 'expo-sqlite';

import { isPinHash } from '@/auth/pin';
import { isGateUserRole, type GateUser } from '@/auth/users';

type GateUserRow = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  role: string;
  pin_hash: string;
  active: number;
};

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toGateUser(row: GateUserRow): GateUser | null {
  const pin = parseJson(row.pin_hash);
  if (!isPinHash(pin) || !isGateUserRole(row.role)) return null;
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    pin,
    active: row.active === 1,
  };
}

export async function findGateUser(db: SQLiteDatabase, employeeNumber: string): Promise<GateUser | null> {
  const row = await db.getFirstAsync<GateUserRow>('SELECT * FROM gate_users WHERE employee_number = ?', employeeNumber);
  return row ? toGateUser(row) : null;
}

/** Every active guard and supervisor on this device. */
export async function activeGateUsers(db: SQLiteDatabase): Promise<GateUser[]> {
  const rows = await db.getAllAsync<GateUserRow>('SELECT * FROM gate_users WHERE active = 1');
  return rows.flatMap((row) => {
    const user = toGateUser(row);
    return user ? [user] : [];
  });
}

/** A guard's first name, for a notice about them; null when they're no longer on this device's list. */
export async function gateUserFirstName(db: SQLiteDatabase, id: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ first_name: string }>('SELECT first_name FROM gate_users WHERE id = ?', id);
  return row?.first_name ?? null;
}

export async function countGateUsers(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM gate_users');
  return row?.count ?? 0;
}

/** Replaces the whole list with the server's, so removals and deactivations reach the device too. */
export async function replaceGateUsers(db: SQLiteDatabase, users: readonly GateUser[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM gate_users');
    for (const user of users) {
      await db.runAsync(
        'INSERT INTO gate_users (id, employee_number, first_name, last_name, role, pin_hash, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.employeeNumber, user.firstName, user.lastName, user.role, JSON.stringify(user.pin), user.active ? 1 : 0],
      );
    }
  });
}
