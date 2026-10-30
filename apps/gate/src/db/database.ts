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
  // Open visits only: a visit's row goes when it closes, and its full story stays in the events. Identifiers are
  // stored normalised so the rules compare like with like. person_key is a keyed hash, never an ID number.
  `
  CREATE TABLE visits (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('vehicle', 'pedestrian')),
    person_key TEXT NOT NULL,
    co_driver_keys TEXT NOT NULL,
    vin TEXT,
    plate TEXT,
    disc_number TEXT,
    occupants INTEGER,
    visit_type TEXT NOT NULL,
    entered_at INTEGER NOT NULL,
    person_name TEXT NOT NULL,
    vehicle_description TEXT
  );
  CREATE INDEX visits_person_key ON visits (person_key);
  CREATE INDEX visits_vin ON visits (vin);
  CREATE INDEX visits_plate ON visits (plate);
  CREATE INDEX visits_disc_number ON visits (disc_number);
  CREATE TABLE vehicle_sightings (
    vin TEXT NOT NULL,
    plate TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    PRIMARY KEY (vin, plate)
  );
  CREATE INDEX vehicle_sightings_plate ON vehicle_sightings (plate);
  `,
  // Who is on duty on this device. ended_at stays null while a shift is on; its full story stays in the events.
  `
  CREATE TABLE shifts (
    id TEXT PRIMARY KEY NOT NULL,
    gate_user_id TEXT NOT NULL,
    post TEXT NOT NULL,
    period TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );
  CREATE INDEX shifts_open ON shifts (ended_at);
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
