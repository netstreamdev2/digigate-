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
  // A shift's photo waits here, encrypted with the rest, until the server has it. away_until is when a guard who said
  // they were stepping away is due back, so the pause survives a restart.
  `
  CREATE TABLE shift_selfies (
    shift_id TEXT PRIMARY KEY NOT NULL,
    taken_at INTEGER NOT NULL,
    jpeg_base64 TEXT NOT NULL
  );
  ALTER TABLE shifts ADD COLUMN away_until INTEGER;
  `,
  // The expiry on the disc a car came in with, so a car leaving with a different disc is caught.
  `
  ALTER TABLE visits ADD COLUMN disc_expires_on TEXT;
  `,
  // The open visits of every gate at the site, from the server, kept apart from this device's own. Each sync writes a
  // new generation and then switches to it in one step, so a scan never reads half a sync. closed_visits remembers what
  // this device ended until the server stops listing it.
  `
  CREATE TABLE site_visits (
    generation INTEGER NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('vehicle', 'pedestrian')),
    person_key TEXT NOT NULL,
    vin TEXT,
    plate TEXT,
    disc_number TEXT,
    disc_expires_on TEXT,
    occupants INTEGER,
    visit_type TEXT NOT NULL,
    entered_at INTEGER NOT NULL,
    person_name TEXT NOT NULL,
    vehicle_description TEXT,
    PRIMARY KEY (generation, id)
  );
  CREATE TABLE closed_visits (
    id TEXT PRIMARY KEY NOT NULL,
    closed_at INTEGER NOT NULL
  );
  `,
  // The photo from a driver's licence waits here, encrypted with the rest, until the server has it, tied to its check.
  `
  CREATE TABLE licence_photos (
    event_id TEXT PRIMARY KEY NOT NULL,
    taken_at INTEGER NOT NULL,
    bmp_base64 TEXT NOT NULL
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
