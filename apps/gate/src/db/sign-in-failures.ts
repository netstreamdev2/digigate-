import type { SQLiteDatabase } from 'expo-sqlite';

export type FailureRecord = {
  count: number;
  /** Epoch ms; 0 while the count is still building up. */
  lockedUntil: number;
};

export async function getFailure(db: SQLiteDatabase, employeeNumber: string): Promise<FailureRecord | null> {
  const row = await db.getFirstAsync<{ count: number; locked_until: number }>(
    'SELECT count, locked_until FROM sign_in_failures WHERE employee_number = ?',
    employeeNumber,
  );
  return row ? { count: row.count, lockedUntil: row.locked_until } : null;
}

export async function setFailure(db: SQLiteDatabase, employeeNumber: string, record: FailureRecord): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO sign_in_failures (employee_number, count, locked_until) VALUES (?, ?, ?)', [
    employeeNumber,
    record.count,
    record.lockedUntil,
  ]);
}

export async function clearFailure(db: SQLiteDatabase, employeeNumber: string): Promise<void> {
  await db.runAsync('DELETE FROM sign_in_failures WHERE employee_number = ?', employeeNumber);
}
