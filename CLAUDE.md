# DigiGate

Gate access control for boom-gated sites. A guard scans the driver's SA licence and the vehicle's licence disc on a Urovo DT50 handheld at entry and exit. The system tracks who is on site and for how long, and flags mismatches at exit — above all a driver leaving in a different vehicle from the one they arrived in, which is how cars get stolen. Walk-in visitors are scanned at the pedestrian gate. A private dashboard shows live on-site status, visit history and alerts.

The first customer is a **hospital**. The product is built to be reused for **residential estates** next, and later other gated sites (office parks, schools, mines). See Site types and tenancy.

Status (2026-10-30): the gate app runs live on the DT50, offline, with no demo data in the gate flows: guard sign-in, shifts, car entry and exit, walk-ins, every rule, supervisor override and an encrypted local database. Licence (including the photo), disc, smart ID and ID-number barcodes all decode in `packages/core`. The dashboard's four role pages are design mock-ups on demo data. Supabase isn't connected yet. Next: the `digigate` schema on photo-fix, sync, onboarding, then the dashboards on real data. The selfie, tones and geofence wait for the next native build.

## Non-negotiables

These override convenience, deadlines and "just for now".

1. **Offline-first.** Every gate action (scan, decode, rule check, result, record) works with zero connectivity. Nothing in the scan path touches the network or waits on sync. Sync runs in the background and is never the guard's problem.
2. **Mismatches are caught on the device.** The rules engine runs locally against local state. The server re-runs the same rules on sync to catch what a single device couldn't see (see Offline & sync).
3. **Scan data is never lost.** An event is committed to the local database in a transaction *before* the result is shown. It survives app kills, reboots and flat batteries, and is purged locally only after the server has acknowledged it.
4. **Snappy.** Scan → result on screen ≤ 300 ms p95 on the DT50, measured in a release build. The scanner is always armed. No spinners, no layout jank, no animation that delays the result.
5. **Raw bytes only.** Never read scans through keyboard-wedge mode: it corrupts the encrypted licence barcode and types PII into whatever app has focus. Scans arrive as raw bytes from the device's scan broadcast via the `scanner` module, and wedge output stays off.
6. **Professional quality, not vibe-coded.** See Quality bar. If something can't be done properly yet, say so and stop. Don't paper over it.
7. **The design system comes from the user.** Fonts, typography, colours and UI elements are supplied by the user. Don't invent a visual style or pull in a UI kit. See Design.
8. **POPIA.** Personal information is handled as in Privacy & security. No PII in logs, ever.
9. **Site-agnostic core.** Nothing hospital- or estate-specific is hardcoded in the core, the schema, the rules or the UI. Differences between site types come from configuration. See Site types and tenancy.

## Hardware

- **Urovo DT50** (product `DT50S`), Android 13 / API 33, Qualcomm `bengal`, Google Mobile Services.
- Scan engine: Honeywell **N5703** 2D imager (`persist.sys.scan.name`), Honeywell `hsmdecoder` service running. `persist.vendor.sys.scan.name` reports `se2030w`. Unresolved, and irrelevant as long as PDF417 decodes.
- Preinstalled Urovo scanner stack: `com.ubx.datawedge`, `com.ubx.uscanner`, `com.ubx.barcodescanner.tool` (test app), SDK jars `com.ubx.usdk.jar` and `com.ubx.platform.jar`. Key remapping (`com.ubx.keyremap`) and RFID packages are present; UHF RFID hardware unconfirmed.
- **NFC confirmed** (`android.hardware.nfc`, switched on). Android NFC reads 13.56 MHz cards (MIFARE, NTAG, DESFire). It can't read 125 kHz proximity cards.
- Confirmed: reads the driver's licence, licence disc and smart ID card PDF417 as raw bytes through the `scanner` module (2026-10-29). **Not yet tested:** green ID book.
- Scan broadcast: Urovo's default is expected to be action `android.intent.ACTION_DECODE_DATA` with extras `barcode` (byte array), `length`, `barcodeType` and `barcode_string`. **Verify on the device in Phase 0** before relying on any of it.
- `adb`: `%ANDROID_HOME%\platform-tools\adb.exe`, on the user PATH for new shells. scrcpy bundles its own copy; if the two versions differ, they restart each other's adb server.
- Urovo draws a floating blue scan button over every app. Whether to hide it on gate devices is a Phase 0 decision.
- Reading device state over adb is fine. **Ask before changing anything on the device** (`settings put`, scanner configuration, kiosk/lock-task, uninstalling apps).

## Stack

| Layer | Choice |
|---|---|
| Gate app | Expo, latest stable SDK (React Native, TypeScript). JS-only work runs in **Expo Go**. Once the `scanner` module exists, a development build (`expo-dev-client`) is required, because Expo Go can't load custom native code |
| Native | Local Expo module `scanner` in Kotlin: receives the vendor's scan broadcast and emits raw bytes (base64) plus symbology to JS through one vendor-neutral interface. Keep it thin, no parsing in Kotlin |
| Local DB | `expo-sqlite` with SQLCipher; key held in the Android Keystore (`expo-secure-store`) |
| Builds | EAS Build in the cloud, for development builds and release APKs (EAS internal distribution, no Play Store). No local Android builds and no emulator: the dev PC is low on RAM (see Environment) |
| Backend | Supabase: Postgres, Auth, Realtime, Edge Functions, inside the live **Digilog360** project (London, eu-west-2) in an isolated `digigate` schema. Everything runs first on its **photo-fix** preview branch (`lrtbiydcqlnvewiwlukc`); never rename it, and never change digilog360's own tables, policies or functions |
| Dashboard | Next.js, latest stable (App Router), on Vercel |
| Shared | `packages/core`: decoders, rules engine, domain types. Used by the app, the dashboard and server-side re-validation |
| Monorepo | pnpm 12 workspaces with hoisted `node_modules`. pnpm's supply-chain settings (`allowBuilds`, `minimumReleaseAgeExclude`) live in `pnpm-workspace.yaml` |

`packages/core` has zero runtime dependencies and uses no Node, DOM or React Native APIs, so the same code runs in Hermes, Node and Deno. Licence decryption uses `BigInt`.

### Versions

- Always the latest **stable** Expo SDK and Next.js. No betas, canaries or release candidates.
- Upgrade within about a month of each stable release, once our dependencies support it. An upgrade isn't done until the gate app has run on the DT50.
- Only add libraries that support the current SDK and React Native's New Architecture.
- React is pinned separately in each app, since Expo and Next.js each require their own version. `packages/core` and `packages/design` don't depend on React, so they never conflict.
- `expo` is pinned to exactly 58.0.20: 58.0.21 came out only hours before the first native build. Move to `~58.0.21` with `expo install --fix` once it has settled and the DT50 build is verified.
- Current versions (2026-10-28): Expo SDK 58.0.20, React Native 0.88.0, React 19.3.0, Next.js 16.4.3, TypeScript ~6.0.3 repo-wide, Node 24, pnpm 12.15.0. TypeScript 7 is out, but Expo SDK 58 and typescript-eslint (`<6.1.0`) don't support it yet.
- Both frameworks change between releases faster than training data. Before touching an Expo or React Native API, read the SDK 58 docs (see `apps/gate/AGENTS.md`). Before touching a Next.js API, read the bundled docs in `node_modules/next/dist/docs/` (see `apps/dashboard/AGENTS.md`).

### Android support

The DT50 (Android 13) is the reference device, not the limit. The app must run on Android 13 and every newer version, so future devices on Android 15+ work without a rewrite.

- `minSdkVersion` 33 (Android 13). Lower it only deliberately, and test on that version first. `targetSdkVersion` follows the Expo SDK default. Never lower it to dodge a platform change.
- Platform rules that apply to us:
  - **Android 14+:** the scan receiver is registered at runtime and the broadcast comes from another app, so it must be registered as exported (`RECEIVER_EXPORTED`), or registration throws. Exported means any app on the device could send fake scans. The mitigation is kiosk mode and keeping other apps off gate devices.
  - **Android 15+:** edge-to-edge is enforced. Every screen handles system bar insets.
  - **16 KB memory pages:** newer devices may use them, so every native library must be 16 KB-aligned. Check before adding any dependency that ships native code.
- Run the app on a new Android version before buying devices that use it.
- **Scanner vendors:** Urovo is the first adapter. Most rugged handhelds (Zebra, Honeywell, Newland, Chainway) can also deliver scans as a broadcast with configurable action and extra names, so a new brand means a new adapter in the `scanner` module, not a new app. The adapter is picked at runtime from the device manufacturer.

## Layout

```
apps/
  gate/                     Expo app (guard handheld)
    modules/scanner/        local Expo module (Kotlin), one adapter per scanner vendor
  dashboard/                Next.js (security managers, admins)
packages/
  core/                     pure TS: decoders, rules, domain types
  design/                   design tokens supplied by the user, shared by both apps
supabase/
  migrations/               SQL migrations; RLS policies live in the same migration as their table
  functions/                Edge Functions
```

## Site types and tenancy

- **Multi-tenant from day one.** Organisation → Site → Gate → Device. Every table carries `org_id` (and `site_id` where it applies), and every RLS policy scopes by organisation. One Supabase project serves all customers; a customer that demands isolation gets its own project running the same code and migrations.
- **Site type is configuration, not code.** Each site has a type (`hospital`, `estate`) that supplies defaults: visit types, registered-person categories, whether a host is captured, which rules are enabled, rule limits and UI labels. A site can override its defaults.
- No `if (siteType === 'hospital')` in components or rules. Behaviour differs only through config values the code reads.
- UI copy that differs by site type ("Staff" vs "Resident") comes from config label keys, never literals.

| | Hospital | Estate |
|---|---|---|
| Registered people | Staff | Residents, domestic workers, estate staff |
| Visit types | `visitor`, `staff`, `delivery`, `contractor`, `patient_dropoff`, `emergency` | `visitor`, `resident`, `domestic_worker`, `contractor`, `delivery`, `ehailing`, `emergency` |
| Host | **Never captured**: it would reveal health information | Unit or house number, and the host resident |
| Estate-only features (Phase 4) | — | Visitor pre-registration by residents, arrival notifications to the host, worker permits with allowed days and times |

## Domain

- **Organisation** → **Site** → **Gate** → **Device**: a registered DT50, set to *vehicle* or *pedestrian* mode.
- **User** roles: `guard` (gate app only, no history), `supervisor` (overrides), `security_manager` (dashboard), `admin`. Estates add `resident` (Phase 4), limited to their own unit.
- **Person**: identified by a keyed hash of ID type + ID number, taken from the licence or smart ID.
- **Vehicle**: identified by VIN from the disc. Plate and disc number are attributes and can change.
- **Visit**: one stay on site, vehicle or pedestrian. Opened by an entry event, closed by an exit event. Holds visit type, host (where the site type allows), occupant count (vehicles), authorised co-drivers and duration.
- **Event**: immutable and append-only: `entry`, `exit`, `override`, `alert_ack`, etc. Visits are derived from events.
- **Alert**: a rule hit, with severity, resolution and who resolved it.
- **Registered person**: a known person (staff, resident, domestic worker, etc.) in a category set by the site type, with known vehicles learned from their visits. See Registered people.
- **Host**: who or where a visitor is visiting (an estate unit and resident). Captured only where the site type allows it.

Visit types come from the site type; see Site types and tenancy.

- Scans can arrive in any order; the entry/exit screen fills in as each document is scanned.
- Authorised co-drivers are scanned at entry and attached to the visit, so a couple can swap drivers legitimately.
- Manual entry is always available (foreign licence or plates, damaged card, unreadable barcode). It is marked `manual` on the event and still goes through every rule.
- Hospital sites never capture which patient or ward someone is visiting.

## Users and sign-in

- Admins create guards and supervisors in the dashboard: name, employee number, role, sites. No email needed.
- Gate devices are shared. Each guard signs in with employee number + 6-digit PIN, so every event records who did it. "Switch guard" handles shift change.
- The app locks after `idleLockMinutes` (3) without a touch or a scan, or as soon as the screen goes off. The lock is a cover over the current screen, not a route change, so a car waiting on a supervisor keeps its result and decision. Scans are paused while it's up.
- **Shifts.** After sign-in a guard with no open shift picks their post and shift period and flips a switch to go on duty (`shift_start`). Signing back in during the shift carries on with it; signing in over another guard's shift and starting one ends theirs (`handover`); a shift nobody ended runs out after `maxShiftHours` (14). The selfie that proves who was really on duty, so one guard can't work on another's login, comes with the next native build (it needs `expo-camera`). It is evidence for people to look at, never face recognition.
- Sign-in works offline: devices hold the site's user list and PIN hashes from sync. Deactivating a user takes effect on each device at its next sync.
- PIN hashes are PBKDF2-HMAC-SHA256 (`{ algorithm, iterations, salt, hash }`, 20,000 iterations for now; measure sign-in time on the DT50 before raising it). The app verifies with `@noble/hashes`; `scripts/hash-pin.mjs` and, later, the server produce the same format with platform crypto.
- Five wrong PINs lock that employee number for five minutes. The count lives in the local database, so restarting the app doesn't clear it.
- Sign-in, failed PINs, lockouts, locks and sign-outs are written to the outbox as events and synced up.
- Paired devices get their site's guard list from Supabase (`gate_users`). Development builds load the demo seed list in `apps/gate/src/demo/seed-users.ts` only while the device is unpaired and has no guards; release builds never do.
- Each device has its own Supabase credential, issued at registration via a one-time pairing QR shown in the dashboard and scanned with the DT50. Revocable from the dashboard.
- Dashboard users (`security_manager`, `admin`) sign in with Supabase Auth and MFA. Guards never get dashboard access.

## Registered people

Called staff at hospitals (doctors, nurses, cleaners); residents, domestic workers and estate staff at estates. There's no HR data to start from, so the list is built up at the gate and in the dashboard.

- **Enrolment**
  - At the gate: guard scans a licence or ID → no match → "Enrol as staff" → picks a category from site config and takes a photo. The person stays `pending` until an admin approves them in the dashboard. Until then they're handled exactly like a visitor.
  - In the dashboard: create directly, or import a CSV later.
- **Recognition:** on every later visit, their licence or ID (or NFC card, later) picks them up automatically and sets the visit type.
- **Vehicles:** people change and borrow cars, so vehicles are never pre-registered. Each registered person has a list of known vehicles learned from their visits. A vehicle they haven't used before raises `UNFAMILIAR_VEHICLE` (INFO) and is added to the list.
- **Being registered never relaxes the mismatch rules.** A staff member who drives in with one car and out with another is flagged like anyone else. Registered means fewer taps, not fewer checks.

### NFC cards (later)

Not in Phases 1–3. Recorded here so the design leaves room for it.

- The DT50 reads 13.56 MHz cards only. If the hospital's existing staff cards are 13.56 MHz, we reuse them. If they're 125 kHz proximity cards, we issue our own (NTAG or MIFARE DESFire).
- Enrol a card by tapping it from the person's record. One active card per person.
- Cards are identified by UID, stored as a keyed hash. UIDs can be cloned, so a tap shows the person's enrolment photo for the guard to compare with their face, and every mismatch rule still runs. DESFire cryptographic authentication is the upgrade path if cloning becomes a real threat.
- Lost or stolen cards are revoked in the dashboard.
- Reading uses Android NFC reader mode inside the `scanner` module, through the same event stream as barcode scans.
- Rules when this ships: `CARD_REVOKED` (RED) when a revoked card is tapped; `CARD_UNKNOWN` (AMBER) when a card isn't enrolled, so the guard scans a licence or ID instead, or enrols the card.

## Rules engine

Lives in `packages/core/rules`. Pure functions: `(scan context, local state) → RuleHit[]`. Each rule has a stable code used everywhere: database, UI copy, tests. Every rule works for every site type; whether it's enabled and its limits (e.g. overstay per visit type) come from site config.

Severity:
- **RED**: boom stays closed. Needs a supervisor override (PIN + reason), which is logged. Works offline; supervisor PIN hashes are synced to devices.
- **AMBER**: guard must acknowledge before continuing.
- **INFO**: recorded, no interruption.

Plates are compared after normalising: uppercase, all non-alphanumerics stripped (`CA 123-456` → `CA123456`).

### Vehicle lane

| Code | Fires when | Sev |
|---|---|---|
| `DRIVER_VEHICLE_MISMATCH` | Exiting driver has an open visit with a *different* vehicle | RED |
| `WALKED_IN_DRIVING_OUT` | Exiting driver's open visit is a pedestrian visit | RED |
| `UNKNOWN_DRIVER` | Exiting driver is neither the entry driver nor an authorised co-driver of this vehicle's open visit | RED |
| `NO_ENTRY_RECORD` | Exiting vehicle has no open visit | RED |
| `PLATE_DISC_MISMATCH` | Plate entered by the guard ≠ plate on the disc | RED |
| `DISC_CLONE_ON_SITE` | Another open visit has the same VIN or disc number with a different plate, or the same plate with a different VIN | RED |
| `PLATE_VIN_HISTORY_CONFLICT` | Plate previously seen with a different VIN, or VIN previously seen with a different plate | AMBER |
| `DUPLICATE_ENTRY` | Entering vehicle already has an open visit | AMBER |
| `DISC_EXPIRED` | Disc past expiry | AMBER |
| `LICENCE_EXPIRED` | Driver's licence past expiry | AMBER |
| `OCCUPANT_COUNT_DROP` | Fewer occupants out than in | INFO |
| `OVERSTAY` | Open visit longer than the limit for its visit type | AMBER |
| `IGNITION_RESTART_FAILED` | The driver couldn't stop the engine and start it again at the exit | RED |
| `BOOT_CHECK_PROBLEM` | The guard opened the boot and found a problem | RED |

- Every vehicle exit requires the ignition check: someone who took a car without its key can't restart it. The guard answers before Check is enabled. The boot check is optional, for when something looks suspicious.
- The three driver rules are mutually exclusive; the most specific one wins, in table order.
- `PLATE_VIN_HISTORY_CONFLICT` is AMBER, not RED: plates legitimately change on a provincial transfer, and personalised plates move between vehicles.
- Checked at entry only: `DISC_EXPIRED`, `LICENCE_EXPIRED`, `PLATE_VIN_HISTORY_CONFLICT`, `UNFAMILIAR_VEHICLE`. Checked at exit only: the three driver rules, `NO_ENTRY_RECORD`, `OCCUPANT_COUNT_DROP`, `OVERSTAY`, `IGNITION_RESTART_FAILED`, `BOOT_CHECK_PROBLEM`. Both: `PLATE_DISC_MISMATCH`, `DISC_CLONE_ON_SITE`.
- A car flagged `DISC_CLONE_ON_SITE` isn't also reported as `DUPLICATE_ENTRY`, and a clone on site suppresses `PLATE_VIN_HISTORY_CONFLICT` for the same evidence.
- Without an entry record there's no entry driver, so `UNKNOWN_DRIVER` doesn't fire alongside `NO_ENTRY_RECORD`. `DRIVER_VEHICLE_MISMATCH` and `WALKED_IN_DRIVING_OUT` still do.
- Documents are valid through their whole expiry date, judged by the calendar day at the site (`RuleConfig.utcOffsetMinutes`).

### Pedestrian lane

Documents: smart ID card, driver's licence, green ID book, manual fallback.

| Code | Fires when | Sev |
|---|---|---|
| `PEDESTRIAN_DUPLICATE_ENTRY` | Person entering already has an open visit (on foot or as a driver) | AMBER |
| `PEDESTRIAN_NO_ENTRY` | Person leaving on foot has no open visit (may have arrived as an unscanned passenger) | AMBER |
| `DRIVER_LEFT_ON_FOOT` | Person leaving on foot is the entry driver of a vehicle still on site | INFO |

`DRIVER_LEFT_ON_FOOT` is informational on its own. If that vehicle later leaves with someone else, `UNKNOWN_DRIVER` fires at the vehicle gate.

An authorised co-driver was scanned in with the car, so leaving on foot raises nothing, and walking back in isn't a `PEDESTRIAN_DUPLICATE_ENTRY` (that rule covers people on foot and drivers only).

### Both lanes

| Code | Fires when | Sev |
|---|---|---|
| `UNFAMILIAR_VEHICLE` | A registered person arrives in a vehicle not on their known-vehicles list | INFO |

## Offline & sync

- The device's SQLite database is the source of truth for the gate; Supabase is the source of truth for the organisation.
- Every gate action writes an immutable event: UUIDv7 generated on the device, `device_id`, `guard_id`, device timestamp, payload. The server adds `received_at`.
- **Up:** an outbox uploads events in order. Inserts are idempotent (`on conflict do nothing`), so retries are always safe.
- **Down:** each device keeps everything it needs to run every rule offline: open visits across all gates, registered people with their known vehicles, users and PIN hashes, site config. Refreshed on an interval and on reconnect.
- **Limits of offline:** a device only knows what it has synced, and two offline devices can't see each other. The server re-runs the rules over incoming events and raises alerts for anything a device missed. The dashboard marks these as server-detected.
- Times are stored in UTC and shown in Africa/Johannesburg (SAST). Device clocks drift, so keep both device time and server time.

How it's built (`apps/gate/src/db`, `apps/gate/src/sync`):
- Local database: `expo-sqlite` with SQLCipher, keyed with a random 256-bit key held in `expo-secure-store`. Expo Go has no SQLCipher, so there the file is unencrypted. The app detects this (`PRAGMA cipher_version`), and the shift screen shows it. Local schema changes go in `MIGRATIONS` in `db/database.ts` (append only, tracked by `PRAGMA user_version`).
- Pairing: an admin issues a one-time 10-digit code for a device row. The app sends it to the `pair-device` Edge Function, which creates the device's own auth user and returns a session. The session is stored in the encrypted database, never in plain storage. Pairing discards outbox events from before pairing, since they belong to no site.
- Sync runs on start, every 60 s, when the app returns to the foreground, and 2 s after any new event. One round uploads the outbox oldest first (idempotent upserts on the UUIDv7 id), deletes acknowledged events, then replaces the local guard list with the site's.
- `gate_events.gate_user_id` has no foreign key on purpose: the log must never reject an event and leave the outbox stuck behind it.
- `apps/gate/src/sync/database-types.ts` is hand-written. Replace it with `supabase gen types typescript` once the project is linked.

## Performance

- Budgets: scan → result ≤ 300 ms p95; cold start → ready to scan ≤ 3 s. Measure on the DT50 in a release build; dev-build numbers don't count.
- The scan path is: native event → decode → rules → one local transaction → render. Nothing else. No network, no awaiting sync, no image work.
- Index local tables for every lookup the rules make (open visits by person key, VIN, plate, disc number).
- Debounce repeat scans of the same barcode within a short window.
- Don't add work to the scan path without measuring it.

## Document barcodes

Verify every format against real scans in Phase 0 and update this section.

- **Driver's licence card**: PDF417, 720 bytes, RSA-encrypted in blocks. Decrypt with the published public keys (two key versions, selected from the header bytes), then parse: surname, initials, ID number and type, licence number, vehicle codes and restrictions, issue and expiry dates, PrDP. The embedded photo uses an obscure format; ignore it.
  - Confirmed on the DT50 (2026-10-29): 720 raw bytes, header `01 9b 09 45` (the newer key version). Real scan in `fixtures.local/driver-licence/`.
- **Licence disc**: PDF417, plain ASCII, wrapped in and separated by `%`. Confirmed on the DT50 (2026-10-29): 141 bytes, 14 fields, in this order:
  1. disc type and version (`LLLDLLDD`, e.g. `MVL1CC..`); 2. a 4-digit code; 3. an 8-character control code; 4. a single digit (meanings of 2–4 TBC)
  5. disc licence number (12 characters)
  6. **number plate** (licence mark, e.g. a Gauteng `LL DD LL GP` plate without spaces)
  7. **vehicle register number** (`LLLDDDL`)
  8. description, English / Afrikaans (e.g. `Hatch back / Luikrug`)
  9. make; 10. model
  11. colour, English / Afrikaans
  12. VIN (17 characters)
  13. engine number
  14. expiry date, `YYYY-MM-DD`
  - The plate comes *before* the register number. Real scan in `fixtures.local/licence-disc/`.
- **Urovo delivery quirks:** the `barcodeType` extra reports PDF417 as `22`, and every scan arrives twice, about 2 ms apart (once per broadcast action). The `scanner` module drops an identical scan inside 250 ms; that fix needs a build after 2026-10-29.
- **Smart ID card**: PDF417 on the back, plain ASCII, 12 fields separated by `|` (checked on a real card 2026-10-29): surname, names, sex (`M`/`F`), nationality, ID number, birth date (`DD MMM YYYY`), country of birth, status (e.g. `CITIZEN`), issue date, a 5-digit security number, then a 9-digit and a 104-digit number whose meaning isn't documented (shape-checked, not read). No photo: it is only on the chip. Checks: ID check digit, birth date, gender and citizenship (11th ID digit) against the ID number, issued after birth.
- **Green ID book**: a barcode carrying only the 13-digit ID number (to confirm on a real book). The small barcode beside the PDF417 on a smart ID carries the same. A scan that is only a valid ID number asks the guard which it is: a smart ID gets a rescan of its large barcode; an ID book gets its name and sex typed in, and the record is marked `green-id-book` and `manual`. Birth date, gender and citizenship come from the ID number.

A decode failure prompts a rescan. Never guess fields.

### Test data

- Real scans are PII. They live in a gitignored `fixtures.local/` folder and are never committed, pasted into issues or logged.
- Licence decryption can only be tested with real scans: we only have the public keys, so synthetic encrypted barcodes can't be made. Parsers and rules are tested with synthetic, obviously fake data, which is committed.

## Privacy & security

- **No PII in logs**: console, crash reports, analytics, error messages, test output. PII here means names, ID numbers, licence numbers, plates, VINs and photos. Log rule codes and event IDs instead.
- ID numbers and licence numbers are stored as a keyed HMAC for matching plus an encrypted value for investigations. Never a plain hash: SA ID numbers are structured enough to brute-force.
- On screen: the gate shows the **current scan in full**, because the guard compares it with the physical document. Everywhere else (history, dashboard lists, exports) identifiers are masked unless the role needs the full value.
- Licence photo: the barcode holds a 200 × 250 greyscale photo of about 620 bytes in Summus Wavelet Image format (header `57 49 04`, then big-endian height and width; Corel's `.wi`), checked on a real card 2026-10-29. There is no spec; the only original decoder is Summus's 32-bit Windows `swi32.dll`, and the community ports are decompiled from it. With the user's lawyer's approval (2026-10-29), `packages/core/src/documents/licence-photo/` is our own TypeScript port of the community decoder's greyscale path. It matches that decoder byte for byte on a real card (local test), runs offline, refuses damaged or unverified variants, and showed the photo on the DT50 on 2026-10-29. `decodeLicencePhoto` runs after the scan result is on screen, never in the scan path. The photo is shown for the current scan only: never cached, stored or synced. barKoder is ruled out. The smart ID card's barcode has no photo; it's only on the chip, which needs government keys.
- The HMAC key is provisioned to devices at registration and held in the Android Keystore.
- PINs are short, so they're stored as salted slow hashes, with lockout after repeated failures.
- Enrolment photos exist only for the guard's visual check. No face recognition.
- Device: SQLCipher-encrypted database, kiosk (lock-task) mode, and the guard sees only the current transaction, with no history browsing.
- Supabase: RLS on every table, deny by default, scoped by `org_id`, policies in the same migration as the table. The `service_role` key exists only in Edge Functions and Vercel server code, never in the app or a browser bundle.
- Dashboard: Supabase Auth with MFA required for every role. PII is fetched server-side only.
- Audit events are append-only. No update or delete grants for anyone. So the server splits each event on arrival: a permanent part with no identifiers (time, gate, device, rule codes) and a separate erasable part (names, ID details, plates, VINs, photo, person key). One logged function is the only thing allowed to delete from the erasable part.
- Retention: day 0 to 365 everything is shown in full; year 1 to 3 it's kept but masked, with full values only through the super user or a site admin they grant, all logged; **3 years after a visit's exit it is permanently erased**, including the keyed person hash. There is no hold, even for an open police case. Staff lose old visits one at a time but keep their staff record. Anonymous counts survive for the KPI charts. After 3 years an empty search proves nothing, so the dashboard must say so.
- Demographics: sex and an age band (never an exact age) are read from the documents of scanned people only, so reports cover drivers and walk-ins. Passengers are a head count and guards never guess at them.
- Schema changes live in `supabase/migrations/`, never made through the Supabase dashboard UI. DigiGate shares digilog360's project and digilog360 deploys with `supabase db push`, so **never run `supabase db push` against it**: one shared migration history would break digilog360's next deploy. Our SQL is applied through the SQL Editor with our own version table, and our Edge Functions are prefixed `digigate-`.
- Secrets live in env vars, EAS secrets and Vercel env. Never committed.

## Quality bar

- TypeScript `strict`. No `any`, no `!` to silence the compiler, no `@ts-ignore` / `@ts-expect-error` without a one-line reason.
- `packages/core` is fully tested with Vitest. Every rule has tests for firing, not firing, and the edge cases in its table row. Decoders are tested against fixtures.
- No placeholder logic, mock data or TODOs in shipping code paths. No commented-out code. No stray `console.log`.
- Errors are handled where they happen and shown to the guard in plain language with a next step. Never swallow an error.
- Every dependency needs a reason. Prefer Expo and platform APIs. No UI kits.
- Small, single-purpose modules. Read the existing code and follow its patterns before adding new ones.
- Build only what the current phase calls for. Backlog items stay in the backlog until the user moves them.
- Scanner and gate UI work isn't done until it has run on the DT50.
- Naming: kebab-case files, PascalCase components and types, camelCase functions, SCREAMING_SNAKE rule codes.

## Design

- The user supplies fonts, typography, colours and UI elements. They go into `packages/design` as tokens and are the only source of styling for both apps.
- Until they arrive, build structure and logic against a small set of clearly named placeholder tokens in that package. No hardcoded colours, sizes or fonts in components. Don't design a look.
- Whatever the visual style, the gate app must:
  - work one-handed, with large touch targets, readable in direct sunlight;
  - make RED / AMBER / GREEN results unmistakable through colour **and** icon, sound and vibration, never colour alone;
  - put the result first on screen, with nothing animating in front of it;
  - keep manual entry one tap away.

## Roadmap

**Phase 0: Hardware spike.** Done: monorepo scaffolded on SDK 58, git initialised. Next: `scanner` module with the Urovo adapter and the first EAS development build; confirm the broadcast and raw bytes; decode licence, disc, smart ID and green ID book on the DT50; measure decode time.

**Phase 1: Gate app, fully offline.** Shared-device guard sign-in (employee number + PIN), vehicle entry and exit, pedestrian entry and exit, staff enrolment and recognition by licence/ID, every rule above, supervisor override, encrypted local database, outbox. Uses a seeded local user list until Phase 2 delivers user management. Build order: decoders and rules in `packages/core` first, tested on the PC against fixtures, then the app around them.

**Phase 2: Supabase, sync, dashboard.** Multi-tenant schema and RLS, site config, up/down sync, server re-validation. Dashboard: live on site (vehicles and people), visit log, alerts, search, registered people and vehicles, staff approval, user management (create guards and supervisors, roles, deactivate), device pairing.

**Phase 3: Hardening, before any live site.** MFA, roles, audit views, retention purge, CSV/PDF reports, multiple gates, kiosk mode.

**Phase 4: Estates.** `estate` site type and its config; residents, domestic workers and their vehicles; host (unit and resident) on visits; visitor pre-registration by residents (invite code or QR sent by WhatsApp/SMS); arrival notifications to the host; worker permits with allowed days and times; `resident` role and a resident-facing app or portal.

**SOS (after sync exists).** The guard long-presses SOS and nothing changes on their own device: no sound, no vibration, nothing an attacker can see. The control room dashboard sounds a siren, and on-duty devices at other gates alarm. A device at the same gate only flashes, silently: a siren beside an attacker would give the guard away. It must also work from the lock screen. It needs a working connection, so don't ship the button until it has been proven end to end: a guard must never believe help is coming when it isn't.

**Geofence (with the next native build).** Each post can have a location and a radius (50 m by default) set in the dashboard. On duty, a guard who walks out of their post's radius gets a warning on the device (a flashing screen edge and vibration) and the control room gets an alert. It works from the device's own GPS, so the check needs no connection; only the control room alert has to wait for a signal. The GPS watch runs apart from the scan path and never touches it. GPS drifts, so judge a fix by its accuracy and how long it lasts, never one reading. It tracks the device, not the person, and stores only leaving and returning, never a trail of where a guard walked. Toilet breaks and patrols are legitimate, so a **Stepping away** button takes a reason and pauses the geofence for about 10 minutes; the control room sees it, and it is logged.

**Backlog (not until the user asks):** NFC staff cards (see Registered people), fake-licence detection, "Not me" exit alert for staff and residents, lockdown mode, incident pack for SAPS, scout detection, banned persons and protection orders, remote override approval, guard scorecard, device health, shift handover, paid parking, contractor pre-registration, plate camera OCR, parking occupancy, daily digest, plain-English search, cross-site watchlist, boom relay, ANPR, phone-camera scanning fallback (the camera library must expose raw bytes, not just text).

## Open decisions

- Gate layout: one lane or separate entry and exit lanes? Devices per gate? Is the pedestrian gate a separate device?
- Connectivity at the gate (Wi-Fi, LTE, none). Shapes sync intervals, and SOS can't work without it.
- Staff cards (for NFC, later): does the hospital already issue them, and are they 13.56 MHz (reusable) or 125 kHz (we issue our own)?
- Overstay limits per visit type; visiting hours.
- Design tokens: pending from the user.
- Android application ID: currently `com.digigate.gate`. Settle it before the first real install, because changing it later means reinstalling the app on every device.
- Estates (Phase 4): must every visitor be pre-approved by a resident, or can the guard call the host? Resident app or web portal?

## Environment

- Windows 11, PowerShell. Repo at `C:\dev\digigate`, deliberately outside OneDrive (sync and long paths break installs and Android builds).
- **Low-RAM PC:** no Android emulator, no local Gradle builds. Use Expo Go on the DT50 for JS work and EAS cloud builds for anything native.
- `JAVA_HOME` = Android Studio's bundled JBR (OpenJDK 21); `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`. Both are set at user level.
- npm's global bin (`%APPDATA%\npm`, where pnpm lives) was added to the user PATH. Shells started before that change need it prepended.

### Environment variables

Templates: `apps/gate/.env.example`, `apps/dashboard/.env.example`. Real values go in the gitignored `apps/gate/.env` and `apps/dashboard/.env.local`, in EAS environment variables for app builds, and in Vercel for the dashboard.

| Name | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Gate app | Built into the app, which is safe for these two. Without them the app runs on local data only |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dashboard | Browser-safe |
| `SUPABASE_SECRET_KEY` | Dashboard server code only | Bypasses RLS. Never `NEXT_PUBLIC_`, never in the app |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` | Edge Functions | Provided by Supabase automatically; nothing to set |

### Commands

Run from the repo root unless noted.

| What | Command |
|---|---|
| Install | `pnpm install` |
| Typecheck everything | `pnpm typecheck` |
| Test everything | `pnpm test` |
| Gate app in Expo Go on a phone (Wi-Fi) | `pnpm exec expo start --lan --go` in `apps/gate`, then open `exp://<laptop IP>:8081` in Expo Go. `--go` is required now that `expo-dev-client` is installed |
| Development build (cloud) | `eas build --platform android --profile development` in `apps/gate`. Install the APK on the DT50, then run `pnpm exec expo start --localhost --dev-client` (with the IPv4 `NODE_OPTIONS` below) and open it from the dev client |
| DT50 says "There was a problem loading the project" | Unplugging or a USB reset clears the port forward. Run `adb reverse tcp:8081 tcp:8081`, then tap **Reload** |
| Hash a PIN for the seed list | `node scripts/hash-pin.mjs <6-digit PIN>` in `apps/gate` |
| Link the Supabase project (once) | From the repo root: `pnpm dlx supabase init` (creates `supabase/config.toml`, keeps the existing migrations), `pnpm dlx supabase login`, then `pnpm dlx supabase link --project-ref <ref>` |
| Apply database migrations | `pnpm dlx supabase db push` (add `--include-seed` for the demo data, development projects only) |
| Deploy the pairing function | `pnpm dlx supabase functions deploy pair-device --no-verify-jwt` |
| Gate app dev server (Expo Go over USB) | `adb reverse tcp:8081 tcp:8081`, then in `apps/gate` with `NODE_OPTIONS=--dns-result-order=ipv4first` set: `pnpm exec expo start --localhost`. Open `exp://127.0.0.1:8081` in Expo Go (or `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent`). Without the IPv4 flag, Metro binds only to `::1`, the USB forward can't reach it, and Expo Go shows "Failed to download remote update" |
| Dashboard dev server | `pnpm dashboard dev` |
| Dashboard lint | `pnpm dashboard lint` |
| Expo health check | `pnpm dlx expo-doctor@latest` (in `apps/gate`) |
| Add an Expo library | `pnpm exec expo install <pkg>` (in `apps/gate`), never a plain `pnpm add`, so versions match SDK 58 |
| Rebuild icon modules | `pnpm --filter @digigate/design icons`, after the SVGs in `packages/design/assets/icons` change. Generates `src/icons/*.ts`; never edit those by hand |
