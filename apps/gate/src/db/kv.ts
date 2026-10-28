import type { SQLiteDatabase } from 'expo-sqlite';

export async function getValue(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setValue(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
}

export async function removeValue(db: SQLiteDatabase, key: string): Promise<void> {
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}

export async function hasValueWithPrefix(db: SQLiteDatabase, prefix: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ found: number }>('SELECT 1 AS found FROM kv WHERE key LIKE ? LIMIT 1', `${prefix}%`);
  return row !== null;
}
