import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'digigate.db';
const KEY_NAME = 'digigate.database-key';

// Applied in order and tracked with PRAGMA user_version. Never edit an entry that has shipped; add a new one.
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE gate_users (
    id TEXT PRIMARY KEY NOT NULL,
    employee_number TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL
  );
  CREATE TABLE sign_in_failures (
    employee_number TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL,
    locked_until INTEGER NOT NULL
  );
  CREATE TABLE outbox (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    gate_user_id TEXT,
    payload TEXT NOT NULL
  );
  CREATE TABLE kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export type LocalDatabase = {
  db: SQLiteDatabase;
  /** False in Expo Go, which has no SQLCipher: the file is then plain SQLite, acceptable only for demo data. */
  encrypted: boolean;
};

async function databaseKey(): Promise<string> {
  const stored = await SecureStore.getItemAsync(KEY_NAME);
  if (stored) return stored;
  const key = Array.from(getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    const migration = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export async function openLocalDatabase(): Promise<LocalDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);

  // SQLCipher must be keyed before anything reads the file. cipher_version only answers when SQLCipher is
  // built in, and without it PRAGMA key silently does nothing, so check rather than assume.
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (cipher) {
    // A raw 256-bit key from the Keystore: no passphrase derivation, so opening stays fast.
    await db.execAsync(`PRAGMA key = "x'${await databaseKey()}'"`);
  }

  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(db);
  return { db, encrypted: cipher !== null };
}
