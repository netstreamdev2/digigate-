# DigiGate

Gate access control for boom-gated sites. A guard scans the driver's SA licence and the vehicle's licence disc on a Urovo DT50 handheld at entry and exit. The system tracks who is on site and for how long, and flags mismatches at exit — above all a driver leaving in a different vehicle from the one they arrived in, which is how cars get stolen. Walk-in visitors are scanned at the pedestrian gate. A private dashboard shows live on-site status, visit history and alerts.

The first customer is a **hospital**. The product is built to be reused for **residential estates** next, and later other gated sites (office parks, schools, mines). See Site types and tenancy.

Status (2026-11-02): the gate app runs live on the DT50, offline, with no demo data in the gate flows: guard sign-in, shifts, car entry and exit, walk-ins, every rule, supervisor override and an encrypted local database. Licence (including the photo), disc, smart ID and ID-number barcodes all decode in `packages/core`. The database, device functions and app sync are live on DigiGate's own Supabase project, and dashboard sign-in, onboarding, people, the control room, the device view, reports and the audit log run on real data. The home address goes to the control room. `/overview`, `/kpis`, `/site-admin` and `/super-admin` are still mock-ups on demo data, with nothing linking to them. The gate's home screen figures and last-scan card run on real data, and manual entry (typed-in cars and people, through every rule) is wired up. Every handheld works from the whole site's open visits, and the server re-runs the rules on every check as it arrives. The shift selfie, result tones, geofence with Stepping away, and device health are on the 2026-11-02 native build, installed on the DT50.

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
| Backend | Supabase: Postgres, Auth, Realtime, Edge Functions, in **DigiGate's own project**, separate from Digilog360, so a problem on one side never takes the other down. Now a free project (`fgtuednylvrknqeyxizz`, Ireland) holding test data only. Before any real site, create a clean Pro project and run the same migrations on it. A unified dashboard over both products comes later; each side must keep its own login, or an outage on one side would lock people out of the other. Tables live in the `digigate` schema |
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

The DT50 (Android 13) is the reference device, not the limit. The app must run on Android 10 and every newer version, so future devices on Android 15+ work without a rewrite.

- `minSdkVersion` 29 (Android 10), lowered from 33 on 2026-11-10 by the user's decision so the Urovo CT58 (Android 12, MediaTek `mt6762`, the same Urovo scanner stack as the DT50) can run it, with room for older handhelds. Checked then: the native modules guard their newer calls (the scan receiver's `RECEIVER_EXPORTED` only on 13+; signal strength needs 9), and nothing in the app or its libraries needs more than Android 7. Runs on 13 (DT50); 12 is to be proven on the CT58, and 10 and 11 haven't been tried on a device. Android 10 to 12 no longer get Google's security updates, so a gate device's patches depend on Urovo. Lower it further only deliberately, and test on that version first. `targetSdkVersion` follows the Expo SDK default. Never lower it to dodge a platform change.
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
  home/                     Next.js landing page for digilog360.co.za: pick DigiLog360 or DigiGate
packages/
  core/                     pure TS: decoders, rules, domain types
  design/                   design tokens supplied by the user, shared by both apps
supabase/
  migrations/               SQL migrations; RLS policies live in the same migration as their table
  functions/                Edge Functions
```

## Site types and tenancy

- **Who's who.** DigiGate rents the system to a **security company** (an organisation), and the company's **clients** (a hospital, an estate) hire it. Guards, devices and billing belong to the company; the sites and their records belong to the client. If a client changes company, the records stay with the client: the old company loses access at once, and the new one sees only what it recorded itself. `digigate.transfer_client` does this, and the rule is enforced in row level security. `client_viewer` gives a client read-only access to its own sites. Who is legally responsible for the data across these three parties is for the lawyer to confirm.
- **Multi-tenant from day one.** Organisation → Site → Access point → Device. A site is the place guarded (Harry Gwala Hospital, Gateway mall): in the schema it is a `clients` row and its one `sites` row (`sites_one_per_client`), made together by `create_site` and kept under one name. The client row is the lasting record that moves when the place changes security company, and that view-only logins ("site viewers") and reports hang from. The dashboard never says "client". Access points are the `posts` table in the schema and code; the dashboard says "access point", and "Vehicles" and "Pedestrians" for its lanes. Every table carries `org_id` (and `site_id` where it applies), and every RLS policy scopes by organisation. One Supabase project serves all DigiGate customers, separate from Digilog360; a customer that demands isolation gets its own project running the same code and migrations.
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
- The app locks after `idleLockMinutes` (8, since 2026-11-10) without a touch or a scan, or once the screen has been off, or DigiGate left, for 5 seconds (`AWAY_GRACE_MS`): Android reports any pause as leaving, including a permission screen or the camera, and those used to lock the app at every photo. The cameras also ask for permission only when it isn't granted yet. The lock is a cover over the current screen, not a route change, so a car waiting on a supervisor keeps its result and decision. Scans are paused while it's up.
- **Shifts.** After sign-in a guard with no open shift picks their post and shift period and flips a switch to go on duty (`shift_start`). Signing back in during the shift carries on with it; signing in over another guard's shift and starting one ends theirs (`handover`); a shift nobody ended runs out after `maxShiftHours` (14). Flipping the switch opens the front camera for a selfie, which proves who was really on duty, so one guard can't work on another's login. It commits with the shift, in the encrypted database, and syncs on its own afterwards to the private `shift-selfies` bucket. If the camera is refused or broken the guard can still go on duty, recorded as `skipped`: a gate is never left unstaffed for want of a photo. The control room sees it through a one-minute link from `digigate-people`, logged each time, and a client's view-only login never gets one. It is evidence for people to look at, never face recognition. The erasure job must delete the file along with the shift.
- **One guard, one handheld** (2026-11-10, migration 37). Each sync brings `onDutyElsewhere`, the company's guards on duty on other handhelds (open shifts under 14 hours old), kept in `db/duty-elsewhere.ts`. Going on duty is blocked for a guard on that list: the start-shift screen says where, and **Move my shift here** takes a supervisor's number and PIN, then sends `shift_start` with `moved_from` and `moved_by`. The server (`digigate.check_shift_start`, a trigger on `event_details` that never raises) ends the old shift as `moved`, logs `gate.shift_moved` with the supervisor, and the old handheld finds it in `movedShifts` at its next sync, closes it locally without sending anything, signs the guard out, and the sign-in screen says why. Two handhelds offline can't see each other, so a shift starting for a guard already on duty elsewhere, without a move, raises `GUARD_ON_TWO_DEVICES` (amber, server) for the control room.
- Sign-in works offline: devices hold the site's user list and PIN hashes from sync. Deactivating a user takes effect on each device at its next sync.
- PIN hashes are PBKDF2-HMAC-SHA256 (`{ algorithm, iterations, salt, hash }`, 20,000 iterations for now; measure sign-in time on the DT50 before raising it). The app verifies with `@noble/hashes`; `scripts/hash-pin.mjs` and, later, the server produce the same format with platform crypto.
- Five wrong PINs lock that employee number for five minutes. The count lives in the local database, so restarting the app doesn't clear it.
- Sign-in, failed PINs, lockouts, locks and sign-outs are written to the outbox as events and synced up.
- Paired devices get their site's guard list from Supabase (`gate_users`). Development builds load the demo seed list in `apps/gate/src/demo/seed-users.ts` only while the device is unpaired and has no guards; release builds never do.
- Each device has its own Supabase credential, issued at registration via a one-time pairing QR shown in the dashboard and scanned with the DT50. Revocable from the dashboard. **Pair a device** on the Devices page walks through company, site, name and QR, searching at each step, skipping any step with only one answer, warning if the site has no access points or staff, and confirming by itself once the handheld connects. On a site's Devices tab it starts at the name.
- **Onboarding a company.** Adding a company, client or site goes straight into it with a notice saying what comes next. The company page lists its sites and carries a checklist (company, administrator, first site, access points with locations, gate staff, a paired handheld), each step with its action, and it goes away once all are done.
- **Site wizard.** Add site opens `/setup/[org]/new-site`, three steps in one save (`digigate.create_site`, one transaction): the site (name, type, code such as DCH, address searched as it's typed, which fills in the location, site geofence, open or managed parking with a number of spaces), then each access point (name, gate type, vehicles and/or pedestrians, booms each automatic or manual, manned, CCTV camera count, ANPR, location and geofence), then a summary to confirm. It lands on the new site's Gate staff tab. A place added before sites and clients were one, with no site yet, shows as Not set up and opens the wizard with `?place=`.
- **Address search.** OpenStreetMap places through Photon (`photon.komoot.io`, `lib/places.ts`), called from a server action limited to administrators, South Africa only. Only the typed words are sent. The public server is slow from South Africa (3 to 13 s from a PC here), so it waits up to 10 s; if it fails, the address is typed by hand and the location pasted from Google Maps. The Access points tab edits any of it later and filters by manual booms or no ANPR.
- **Adding gate staff.** One popup, from the site's Gate staff tab, the company checklist or People (which first asks for the site): first name, surname, employee number, a 6-digit PIN (Make a PIN draws one), guard or supervisor. It stays open after each save, showing who was added and their PIN to hand over, ready for the next.
- Dashboard users (`security_manager`, `admin`) sign in with Supabase Auth and MFA. Guards never get dashboard access.
- **Usernames belong to a company, behind the scenes** (migration 28): each company has a short `code` from its name (`fire`, `lion`), and a username is stored as `name@code`, an account whose email is `name@code.digigate.local`. People only ever type and see `lucy` (`usernameOf` in `lib/format.ts`): the `digigate-signin` Edge Function finds every active account with that name and signs in to the one the password opens, and when one name and password open accounts at two companies it asks which (only someone holding that password sees the choice). A wrong password and an unknown name get the same answer. Two companies can each have a `lucy`; a taken name is only ever someone in the admin's own company, so the dashboard says who and suggests a free one. Super users keep plain accounts (`name@digigate.local`); a real email, or `name@code` typed in full, goes straight to Supabase. A client's view-only login takes its company's code when it's made. `digigate.scope_logins()` moved every existing login on 2026-11-04 and is safe to run again.

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
| `DISC_CHANGED_ON_SITE` | Exiting car carries a different disc from the one it came in with: same VIN, but another plate, disc number or expiry | RED |
| `PLATE_VIN_HISTORY_CONFLICT` | Plate previously seen with a different VIN, or VIN previously seen with a different plate | AMBER |
| `DUPLICATE_ENTRY` | Entering vehicle already has an open visit | AMBER |
| `DRIVER_ALREADY_ON_SITE` | Entering driver already has an open visit: on foot, or as the driver of another car still on site | AMBER |
| `DISC_EXPIRED` | Disc past expiry | AMBER |
| `LICENCE_EXPIRED` | Driver's licence past expiry | AMBER |
| `OCCUPANT_COUNT_DROP` | Fewer occupants out than in | INFO |
| `OCCUPANT_COUNT_RISE` | More occupants out than in | INFO |
| `OVERSTAY` | Visit longer than the stay recorded at entry (else the site's limit for its visit type) | INFO |
| `IGNITION_RESTART_FAILED` | The driver couldn't stop the engine and start it again at the exit | RED |
| `BOOT_CHECK_PROBLEM` | The guard opened the boot and found a problem | RED |

- Every vehicle exit requires the ignition check: someone who took a car without its key can't restart it. The guard answers before Check is enabled. The boot check is optional, for when something looks suspicious.
- The three driver rules are mutually exclusive; the most specific one wins, in table order.
- `PLATE_VIN_HISTORY_CONFLICT` is AMBER, not RED: plates legitimately change on a provincial transfer, and personalised plates move between vehicles.
- Checked at entry only: `DISC_EXPIRED`, `LICENCE_EXPIRED`, `PLATE_VIN_HISTORY_CONFLICT`, `UNFAMILIAR_VEHICLE`, `DRIVER_ALREADY_ON_SITE`. Checked at exit only: the three driver rules, `NO_ENTRY_RECORD`, `DISC_CHANGED_ON_SITE`, `OCCUPANT_COUNT_DROP`, `OCCUPANT_COUNT_RISE`, `OVERSTAY`, `IGNITION_RESTART_FAILED`, `BOOT_CHECK_PROBLEM`. Both: `PLATE_DISC_MISMATCH`, `DISC_CLONE_ON_SITE`.
- `DRIVER_ALREADY_ON_SITE` leaves the same car entering twice to `DUPLICATE_ENTRY`. It's AMBER like its on-foot twin: the person may simply have left unscanned, so the guard checks the face against the licence photo.
- `DISC_CHANGED_ON_SITE` compares with the disc scanned at entry. Its expiry is compared only for visits recorded since the gate app kept it (local migration 5).
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
| `HOTLIST_MATCH` | The person (by person key), a plate seen (on the disc or read off the car) or the VIN is on the company's hotlist for this site | RED |
| `UNFAMILIAR_VEHICLE` | A registered person arrives in a vehicle not on their known-vehicles list | INFO |

`HOTLIST_MATCH` fires at entry and exit, in a car and on foot, and comes first among the hits. The guard sees the company's instruction for that entry, never the reason; the control room's check popup shows both. Entries are added on the dashboard's Hotlist page by admins, managers, the control room and super users, for every site of a company or one site, until taken off or until a date. An ID number becomes the same person key the handheld makes (`digigate.person_key_for`, an HMAC in plain SQL on the company's own key); only its last four digits are kept to show.

**Expected visitors** aren't a rule: a booking made on the dashboard (by ID number, plate or both, for up to 31 days at one site) shows on the guard's result as "Expected" with its note, the entry event carries `expected_visitor_id`, and the server marks the booking arrived. No host is recorded.

### Guards

| Code | Fires when | Sev |
|---|---|---|
| `LEFT_POST` | The device has been outside its post's geofence for a minute, with no reason given | AMBER |

`LEFT_POST` comes from the `left_post` event, not a check. It closes itself when the guard comes back, says they're stepping away, or goes off duty, and it counts in the day's rule hits on reports.

## Offline & sync

- The device's SQLite database is the source of truth for the gate; Supabase is the source of truth for the organisation.
- Every gate action writes an immutable event: UUIDv7 generated on the device, `device_id`, `guard_id`, device timestamp, payload. The server adds `received_at`.
- **Up:** an outbox uploads events in order. Inserts are idempotent (`on conflict do nothing`), so retries are always safe.
- **Down:** each device keeps everything it needs to run every rule offline: open visits across all gates, registered people with their known vehicles, users and PIN hashes, site config, the hotlist entries in force for its site (`hotlist`) and the bookings for today and the next three days (`expectedVisitors`). Refreshed on an interval and on reconnect. An entry that runs out stops matching on the device at that moment, synced or not.
- **Limits of offline:** a device only knows what it has synced, and two offline devices can't see each other. The server re-runs the rules over incoming events and raises alerts for anything a device missed. The dashboard marks these as server-detected.
- **Shared visits (built):** `device_snapshot` sends the site's open visits (`openVisits`, this company's, newest 5,000) and the day's figures (`siteToday`). The gate keeps them in `site_visits` apart from its own `visits`: each sync writes a new generation and switches to it with one write, so a scan never reads half a sync. `closed_visits` hides what this device ended until the server stops listing it, and a visit this device opened is dropped once the server stops listing it, unless an event about it is still waiting to upload.
- **Server re-check (built):** `digigate-sync` runs each new check through `recheck` from `packages/core` against every gate's open visits, before storing the batch, and raises what the handheld didn't as alerts with `source = 'server'`. A check it can't judge is still stored. The rules reach Deno as a bundle: run `pnpm functions:bundle` before deploying `digigate-sync`.
- Times are stored in UTC and shown in Africa/Johannesburg (SAST). Device clocks drift, so keep both device time and server time.

How it's built (`apps/gate/src/db`, `apps/gate/src/sync`):
- Local database: `expo-sqlite` with SQLCipher, keyed with a random 256-bit key held in `expo-secure-store`. Expo Go has no SQLCipher, so there the file is unencrypted. The app detects this (`PRAGMA cipher_version`), and the shift screen shows it. Local schema changes go in `MIGRATIONS` in `db/database.ts` (append only, tracked by `PRAGMA user_version`).
- Pairing: an admin issues a one-time 10-digit code for a device, shown as a QR and as digits. The app sends it to the `digigate-pair` Edge Function, which creates the device and returns its secret token and its organisation's person key, both kept in the Android Keystore. Devices are not login accounts; every later call goes to `digigate-sync` with the token. The server keeps only a SHA-256 hash of the token, and revoking a device in the dashboard ends its access at the next sync.
- Sync runs on start, every 60 s, when the app returns to the foreground, and 2 s after any new event. One round uploads the outbox oldest first (idempotent upserts on the UUIDv7 id), deletes acknowledged events, then replaces the local guard list with the site's.
- `gate_events.gate_user_id` has no foreign key on purpose: the log must never reject an event and leave the outbox stuck behind it.
- Edge Functions reach the database with the `SUPABASE_DB_URL` connection they are given and call functions such as `digigate.ingest_events`. Each runs as one transaction, so a dropped connection can't leave half an upload saved. Devices never touch the database or its API directly.

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
- **Erasure (built, migration 24):** `digigate.erase_due()` runs nightly at 01:30 SAST (pg_cron) and deletes what is past `erase_after`: check and visit details, ended shifts with their selfie, hotlist entries (3 years after they end) and bookings (3 years after their last day), and the free-text note on alerts about erased checks. The bare events and visits stay, with nothing that identifies anyone. Photo paths go onto `digigate.erasure_files` in the same transaction, and `digigate-erasure` removes them from Storage at 01:45, called by the schedule with a token kept in Vault; a file it can't remove stays queued for the next night. Each company's audit log gets one "Erasure" line a night, in counts only.
- Demographics: sex and an age band (never an exact age) are read from the documents of scanned people only, so reports cover drivers and walk-ins. Passengers are a head count and guards never guess at them.
- Schema changes live in `supabase/migrations/`, never made through the Supabase dashboard UI. Everything is in the `digigate` schema: nothing there is reachable unless a migration grants it.
- Secrets live in env vars, EAS secrets and Vercel env. Never committed.

## Quality bar

- **Built for scale, every screen.** Design as if there are 60 security companies holding 80 hospitals and estates each, because there will be. No screen loads or renders an unbounded list, and nobody scrolls two kilometres:
  - Hierarchies are drilled into (company, client, site) with breadcrumbs back up, never shown all at once.
  - Every list is searched, filtered and paged on the server, 25 rows at a time. The database only ever sends the current page, with counts for the headings.
  - Forms open in popups, so a list page stays a list. Dropdowns fetch only what the current choice needs, never a whole table.
  - A page shows one thing at a time: use tabs for the sections of one site.
  - Use the shared pieces: `components/list.tsx`, `search-box.tsx`, `form-dialog.tsx` and `lib/paging.ts`.
  - Never put a `WITH` clause in a view. It stops the view merging into the query reading it, so `ORDER BY` and `LIMIT` can't reach the indexes and every page joins a site's whole history. Use plain subqueries.
  - Time new reads with gate traffic loaded (`pnpm simulate`), not on empty tables. An empty table makes every query look fast.
  - A number that's about to be read across a period comes from `daily_activity`, not from counting events.
  - Row security checks each row against a list that runs to thousands of sites for a super user, so a read across every site can't lean on it. Run it as its owner, join to `visible_site_ids()` once, and wrap `viewer_org()` and `viewer_client()` in `(select ...)` so they run once per read, not once per row. Its WHERE and joins then are the access check, and need the same tests as a policy.
- **A failed read never looks like an empty result.** "No alerts" or "not your site" must only ever mean exactly that. A read that fails throws, and `error.tsx` says so and retries by itself. Every read goes through `must` or `counted`, whose error carries the database's code (only the code) so the server log shows why.
- **A popup that shows something once never sits where a refresh can remove it.** A temporary password or a pairing result stays until it's closed: the page refreshes when the popup closes, not when the save lands, and a checklist keeps the button holding it.
- **Never count through the API on a table with locked columns.** An embedded count such as `gate_users(count)` counts whole rows, and a whole row includes `pin`, so it's refused (42501) and takes the page with it. Count in a function instead, as `company_board` does.
- **Anything that can't be undone with a click asks first** in a popup that says what will happen, with Cancel as the safe default.

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
- Dashboard frame (built 2026-11-04): every signed-in page lives under `app/(app)/`, whose layout holds the sidebar, so it stays put between pages and only the page changes. Pages render `AppShell` (title, chips, actions) and a `PageSkeleton` while they load, never "Loading…".
  - Motion lives in `components/motion.tsx` and `globals.css`: page changes run through view transitions (the sidebar's pill and the chosen tab slide, the title travels, a company's logo grows from its card into the company banner via `data-morph`), glass catches the pointer's light, company cards tilt. Reduced motion gets plain fades. Nothing animates in front of a live alert.
  - A super user goes into a company only on purpose: a page under the company (its id in the path: sites, admin, reports) takes them in, and a page filtered to it (`?company=`) keeps them in if they're there but never takes them in, offering "Go into" instead. The colours come only from that one record (`components/company-theme-sync.tsx`), never from a page: pages visited a moment ago stay alive, hidden, and would keep their colours.
  - A super user inside a company: a company's page renders `CompanyBeacon` (through `AppShell`), and the sidebar folds the super user's own pages into an icon rail (DigiGate blue on hover, with a label, and only the company they're inside) with that company's sidebar open beside it (`lib/company-nav.ts`). It lasts while the address names the company or one of its sites (`lib/company-context.ts`). Forms opened there only offer that company: `SitePicker` and `siteChoices` take an `orgId`, the hotlist form skips the site unless it's for one site, and pairing and adding people start at the company.
  - Evacuation (`/control-room/[site]/evacuation`, a red button on each site's live page and in Ctrl+K): everyone inside now (cars with their passengers counted, people on foot, gate staff on duty) as a roll call ticked off on screen (ticks stay in the page, never the server) that prints as plain A4 through the `@media print` rules in `globals.css`.
  - Ctrl+K (⌘K) search everywhere (`components/quick-search.tsx`, `app/(app)/quick-search.ts`): pages, companies, sites with their evacuation lists, who's inside now, the last 30 days' checks, gate staff and the hotlist, a few of each, through row security.
  - New red and amber alerts pop up on every page (`components/alert-toasts.tsx`), polled every 10 s while the tab is visible and timed by when they reached the server. Red chimes (made with Web Audio, switchable off) and stays; amber goes after 15 s. Alerts open when the page loaded aren't announced.
  - A booking can be sent on WhatsApp: a `wa.me` link with the message filled in, sent by the person who booked from their own WhatsApp. DigiGate keeps no phone numbers.
  - Checks (`/checks`): every check in and out over a range of days (7 by default, 92 at most), filtered by direction, result, lane, company and site, and searched by name or plate in the database, using the control room's rows, hover card and popup (`lib/check-rows.ts`). Hover cards render into `document.body`: glass and animated panels carry a `position: fixed` along with them.
  - A company's look: admins and super users add a logo and colour on its setup page. The browser redraws the logo as a small WebP or PNG (`lib/logo-image.ts`) into the public `company-logos` bucket; `lib/company-theme.ts` turns the colour into an accent darkened to pass WCAG AA and a wash for the glass. People who work for a company see it everywhere, with its logo in the sidebar; a super user sees it inside that company's pages, under a banner saying whose company they're working in.

## Roadmap

**Phase 0: Hardware spike.** Done: monorepo scaffolded on SDK 58, git initialised. Next: `scanner` module with the Urovo adapter and the first EAS development build; confirm the broadcast and raw bytes; decode licence, disc, smart ID and green ID book on the DT50; measure decode time.

**Phase 1: Gate app, fully offline.** Shared-device guard sign-in (employee number + PIN), vehicle entry and exit, pedestrian entry and exit, staff enrolment and recognition by licence/ID, every rule above, supervisor override, encrypted local database, outbox. Uses a seeded local user list until Phase 2 delivers user management. Build order: decoders and rules in `packages/core` first, tested on the PC against fixtures, then the app around them.

**Phase 2: Supabase, sync, dashboard.** Multi-tenant schema and RLS, site config, up/down sync, server re-validation. Dashboard: live on site (vehicles and people), visit log, alerts, search, registered people and vehicles, staff approval, user management (create guards and supervisors, roles, deactivate), device pairing.

**Phase 3: Hardening, before any live site.** MFA, roles, audit views, retention purge, CSV/PDF reports, multiple gates, kiosk mode.

**Phase 4: Estates.** `estate` site type and its config; residents, domestic workers and their vehicles; host (unit and resident) on visits; visitor pre-registration by residents (invite code or QR sent by WhatsApp/SMS); arrival notifications to the host; worker permits with allowed days and times; `resident` role and a resident-facing app or portal.

**Reports.** Reports read `daily_activity`: one anonymous row per site per day, counted as events arrive, so a yearly report costs what a daily one does and the numbers outlive the 3-year erasure. A report holds counts only, never a name, ID number or plate, which is what makes it safe to email. The dashboard, the PDF and the email all take their wording and maths from `packages/core/src/reports.ts`. `digigate-reports` draws the PDF and sends through Resend, and schedules run inside Supabase, so they don't need the dashboard or anyone's PC to be on. Schedules always report on the period that has just finished, and a failed send isn't retried: it shows in Sent reports and the audit log. A period still running is compared with the same days of the one before, and a day still running isn't compared at all. Email a client a report filtered to that client: a whole-company report shows every client's numbers.

**Audit log.** `audit_log` is written by the database, through triggers and `ingest_events`, so no screen or function can forget to record what it did. The Edge Functions add what the triggers can't see (`digigate-people`, report sends). It's append-only and never erased, so it holds field names, rule codes and shift facts, never values: no visitor's name, no PIN, no override's free-text reason, no email address.

**SOS (after sync exists).** The guard long-presses SOS and nothing changes on their own device: no sound, no vibration, nothing an attacker can see. The control room dashboard sounds a siren, and on-duty devices at other gates alarm. A device at the same gate only flashes, silently: a siren beside an attacker would give the guard away. It must also work from the lock screen. It needs a working connection, so don't ship the button until it has been proven end to end: a guard must never believe help is coming when it isn't.

**Geofence.** Each access point can have a location and a radius (50 m by default). It is set on a map in the dashboard (the site wizard and every access point popup: click or drag the pin, the geofence drawn round it, or "Use where I am"; OpenStreetMap's tiles, fine for setup screens but to be swapped for a paid tile service if traffic grows), by typing coordinates, or on the handheld: **Set this access point's location** (shift screen, or home when it has none) waits for a GPS fix good to 15 m, averages the last five, takes a geofence of 30 to 200 m and a supervisor's number and PIN, and records `post_location_set`, which `digigate.apply_post_location` applies when it syncs (active supervisors of the device's own company, at its own site, only; logged as `gate.post_located`). The device starts the geofence at once. Home tells a guard when their access point has no location, since then leaving it isn't checked. A post with no location isn't checked. On duty, a guard who walks out of their post's radius gets a warning on the device (a flashing screen edge and vibration, on top of everything, the lock screen too) and the control room gets a `LEFT_POST` alert. It works from the device's own GPS, so the check needs no connection; only the control room alert has to wait for a signal. The GPS watch (`apps/gate/src/shift/post-fence.ts`, decisions in `packages/core/src/geofence.ts`) runs apart from the scan path and never touches it. It runs as a foreground service, which needs no background-location permission and keeps going with the screen off; Android can hold a reading back by up to a minute then, so the warning can come late but the sums stay right. GPS drifts, so a reading only counts if it's accurate to 40 m and clear of the fence by its margin of error, and it has to hold for a minute (20 seconds to come back). It tracks the device, not the person, and stores only leaving and returning, never a trail of where a guard walked. Toilet breaks and patrols are legitimate, so a **Stepping away** button takes a reason from the site's list and pauses the geofence for 10 minutes, and **I'm back** ends that early. If the guard isn't back when it runs out, the usual wait starts afresh. The control room sees it, and it is logged.

**Device health.** Each handheld reports its battery level and whether it's charging, app version, connection, Wi-Fi name and strength, mobile generation and bars, whether location is on, and last known position, and the Devices page shows them. Reports travel with the background sync (`apps/gate/src/sync/device-health.ts`) and never touch the scan path; bars come from the small `device-signal` Kotlin module. Each report overwrites the last, so there's only ever a current value: location especially, because a stored history would be the trail of a guard's movements the geofence rules out. `record_device_health` keeps only the fields it lists, and a client's view-only login never gets the position.

**Result tones.** `scripts/make-tones.mjs` generates the three tones in `apps/gate/assets/sounds`, matched to the vibration patterns. They're preloaded so a sound never delays a result. New native libraries load through `apps/gate/src/lib/native.ts`, so an older build or Expo Go gets a plain fallback rather than a crash at start-up. Check each new library for New Architecture support and 16 KB alignment before adding it.

**Control room check details** (built 2026-11-03; photos start once the DT50 runs the new app). Hovering a row in a site's live list shows who it was; clicking it, or Enter, opens everything scanned (`digigate.check_detail`, the live list's own visibility and 365-day masking): driver, licence expiry and codes, vehicle (icon, make, model, colour and body type; no car pictures, by the user's decision), both plates, disc expiry, people in it, access point, guard (never for site viewers), stay and alerts, and the photo from the driver's licence. The user decided every dashboard login that can see the site sees the photo. The handheld keeps the decoded photo in `licence_photos` once the check is on record, never as part of it, and sync sends one a round, like a selfie, to the private `licence-photos` bucket. It opens through `digigate-people` (`licence-photo-link`, asked as the caller so the database decides) with a one-minute link, logged each time with the driver masked. The erasure job must delete the file with the check's details. Keeping licence photos is still to be confirmed by the lawyer with the rest of retention.

**Plate photos** (built 2026-11-05; needs a new APK, as it adds a native module). At vehicle entry and exit, and on the typed-in screen for cars, the guard photographs the car's number plate first; typing stays one tap away. The local `plate-reader` module (Kotlin, Google ML Kit text recognition 16.0.1 with its model bundled, so it reads offline; its native library is 16 KB-aligned, about 11 MB) hands back every line of text with its height, and `plateReadings` in `packages/core` picks the plate (SA layouts first, then the tallest text), at most three readings for the guard to choose from. Never trusted on its own: the guard confirms it against the photo, retakes it, or types it. The disc's plate stays hidden until the check, as before; instead, the first Check with a plate that isn't the disc's says "Doesn't match the disc, look again" without showing the disc's plate, and the second Check goes ahead, so a slip (S for C) is fixed at the gate instead of becoming a RED alert. `PLATE_DISC_MISMATCH` itself is unchanged. The event payload gains `plate_entry`: `source` (`photo` when the plate given is the reading, else `typed`), `photo`, `read_from_photo` and `warned_plate` (the plate as it was when the guard was told it didn't match, or null). The photo (about 960 px on its short side, JPEG) waits in the encrypted `plate_photos` table and goes up one a round like a licence photo (`platePhoto` on `digigate-sync`, bucket `plate-photos`, private, 1 MB, `attach_plate_photo`, migration 29). The dashboard's check popup shows it beside the vehicle (click to enlarge) with the plate the guard gave, any character that isn't on the disc boxed, and a sentence saying how the plate was given; closing a plate mismatch alert offers the photo and one-tap reasons ("Guard typo: the plate photo shows the disc's plate"). Links last a minute and every look is logged (`check.plate_photo_viewed`, plate masked). Kept like the licence photo: not shown after 365 days, deleted with the check's details by the erasure job. The photos DigiGate keeps are now: guard profile photos, licence photos, shift selfies and plate photos.

**Stays, head counts and the site log** (built 2026-11-05, migrations 30 and 31; the gate side needs the new APK). At entry the guard records the expected stay: the visit type's by default (`stayMinutesFor` in `packages/core`: hospital visitor 4 h, delivery 1 h, drop-off 30 min, contractor 10 h, staff and emergency no limit; estate likewise, e-hailing 15 min), changed per site by its admins under Expected stays on the site's setup page (`sites.stay_minutes`), and per visit by the guard from `STAY_CHOICES`. The visit keeps `expected_until`; `OVERSTAY` uses it and is now INFO (the car is leaving anyway), and the control room's On site now shows the time left, or "Over by" in red with the overstay icon, pulsing (steady for reduced motion), with the count over their time. The guard counts the people in a car as men, women and not sure (`occupants_by_sex`; the driver starts as their licence says), kept on the visit as counts only. A different count at the exit is only noted (`OCCUPANT_COUNT_DROP` or `OCCUPANT_COUNT_RISE`): the gate shows a card with reasons from the site type (`occupantReasonsFor`, "Dropped off a patient" only at hospitals), and a tap sends an `occupant_reason` event after the check; the reason goes in `visit_details.occupant_reason` (erasable) and on the INFO alert, and the check popup shows came in, left and why. The audit log now tells the site's story too: a trigger logs every alert as `alert.raised` (rule, site, access point, direction, severity, never a name or plate; past alerts were backfilled), the guard's reason as `gate.occupant_reason` without the reason itself, and the Alerts tab is "Flags and alerts". Searches on Checks, the site's On site now and Ctrl+K match every word against the name, plate and the car (`vehicle_search` on `check_records` and `visit_records`: make, model, colour and the disc's body type), with `vehicleSearchTerms` mapping everyday words to the disc's (SUV to "Station wagon", bakkie to "LDV", hatchback to "Hatch back / Luikrug").

**Children and colour coding** (2026-11-09, migration 35). The guard counts a car's people as men, women, boys, girls and not sure (`OccupantsBySex` in `packages/core`, a baby they can't tell is "not sure"); children are in the total, so `OCCUPANT_COUNT_DROP` and `OCCUPANT_COUNT_RISE` notice a child more or fewer, and `digigate.occupants_by_sex` now keeps `boy` and `girl`. The evacuation list counts children with their car, never as pedestrians, and says how many of the people inside are children. Dashboard figure tiles are colour-coded by meaning (`components/tile-colour.ts`): entries green, exits purple (the `exit` token), problems red and warnings amber only while their count is above zero, everything else blue; In and Out chips in check lists match. The control room's Checks and On site now run the full page width, so the tables fit without scrolling sideways.

**Launch grace** (built 2026-11-09, migration 34). When a site goes live, cars already parked there have no DigiGate entry and would be stopped as `NO_ENTRY_RECORD` on the way out. An admin presses Start launch grace on the site's setup page (`digigate.start_launch_grace`, logged as `site.grace_started`); `sites.launch_grace_until` is then 7 days away and the grace ends by itself. While it runs, a vehicle exit with no open visit raises `ARRIVED_BEFORE_DIGIGATE` (AMBER, "Came in before DigiGate") instead: the guard checks the licence and disc and lets it through or turns it away, in the words of their gate. Nothing else softens: driver, disc, clone, hotlist and boot rules still stop the car. The rule reads `RuleConfig.launchGraceUntil` against the time of the scan (`inLaunchGrace`); the handheld gets it in the snapshot, `digigate-sync` re-checks with the site's own, and the control room shows a countdown banner while it runs. End now (`end_launch_grace`) stops it early and is logged.

**Landing page** (`apps/home`, built 2026-11-09, not deployed yet). DigiLog360 is the parent brand, and digilog360.co.za will open on a page where people pick DigiLog360 or DigiGate and go to that product's own sign-in. It holds no sessions, data or secrets, and the two products keep separate logins and databases. Product addresses live in `src/products.ts`, overridable by `NEXT_PUBLIC_DIGILOG360_URL` and `NEXT_PUBLIC_DIGIGATE_URL` (DigiGate is digigate.digilog360.co.za, DigiLog360 is www.digilog360.co.za); `/digigate`, `/digilog` and `/digilog360` redirect straight there (307). Logo files are Astra's DigiLog360 refresh (palette `#328BD2`, `#141833`, `#AAB4C4`) and a white version of DigiGate's logo for navy. The plan is its own small Vercel project, so the front door stays up through a product's bad deploy. As checked on 2026-11-09: bare digilog360.co.za shows a hosting company default page with a broken certificate, www.digilog360.co.za is DigiLog360's production app on Vercel and must not change, and mail. and webmail. stay on the email host. Before moving the bare domain, confirm nobody's mail client uses it as their mail server. The page greets each browser session with a tap-to-enter welcome ("Welcome to the Digi platform", a recorded clip, `public/sounds/welcome.mp3`, made with the open-source Kokoro voice "Heart"; its source is noted in `welcome-voice.ts`): browsers allow no sound before a click or tap, which is why it asks for one. Hovering a card turns the page to that product's colours with a soft chime (Web Audio, no sound files); a speaker button turns sound off, remembered per browser. The DigiGate dashboard links across the other way: a DigiLog360 tile above the user card in the sidebar (and an icon in the super user's rail), `lib/sister-product.ts`, address overridable by `NEXT_PUBLIC_DIGILOG360_URL`. It's a suggestion, not an advert: it has a shutter, so anyone can slide it down to a slim bar and open it again, remembered on that browser; the rail icon has none. DigiLog360 is to get the matching DigiGate tile in its own code.

**Gates with no boom** (2026-11-05, migration 33). Some sites have no barrier: the gate stands open and the guard waves cars through or asks them to stop. That comes from the access point having no booms on the dashboard, never from the site or the company: each post in the snapshot carries its booms, and the gate app speaks for it (`lib/gate-words.ts`): "Let them in", and on a red result "Don't let the car through: ask the driver to pull aside and switch off, and call your supervisor. Never stand in its way." Rule messages carry `{stop}` for that instruction. A post from an older server counts as having a boom. The dashboard, reports and PDFs use wording that fits either ("Stopped at the gate").

**Old-system checks** (built 2026-11-05, migration 32). A site's checks from its previous gate system come in through `node supabase/setup/import-old-checks.mjs <project ref> <site id> <export.xlsx> [--dry-run]`, run by the user in their own terminal (it writes real people's records to production). They land in `digigate.imported_checks`, never in DigiGate's own events: no rule results, no photos. ID numbers never leave the PC that runs it: an SA ID number becomes the company's person key there (HMAC with `digigate.org_person_key`, the same key a handheld gets at pairing); other numbers are dropped, as are GPS points and free-text notes. Rows are keyed by the old system's own id, so a run can be repeated; anything three years old is refused. Read only through `imported_check_records` (the same visibility and 365-day masking as `check_records`; no guard names for client viewers); erased three years after each check by `erase_due`. Since migration 36 they share one list with DigiGate's own checks, with no tabs: `digigate.all_check_records` is the two views together, each half applying its own visibility, so a company only ever sees its own old or new checks (a super user, with All companies, sees every company's, as for DigiGate's checks). An old check reads "Old system" in the Result column and opens a card of what it recorded, with no server call. They count in reports: `tally_imported_check` adds each to `daily_activity` and `daily_counts` as it's imported (the trigger `count_imported_check`; the first 19,977 were counted by the migration), as a scan with its hour, an entry with its visit type and licence sex, or an exit. Old exits have no stay, so they're also `untimed_exits`, `report_data` gives `timed_exits`, and `averageStay` divides by those; blocked, warnings and overrides stay DigiGate's alone. The first export (Duncan Security's hospital, 21 Sep to 5 Nov 2026) stopped at the old system's 20,000-row export cap; earlier months need exports a month at a time, and only back three years. The old data's entry and exit pairing is too patchy to rebuild who is on site, so no open visits are imported.

**Admin tab** (built 2026-11-03; not yet on the DT50). `/admin`, for a company's administrators and super users only, never the control room (`can_manage_org`). An administrator lands on their own company; a super user picks one.
- **Guards.** Adding a guard stays the quick popup. Admin lists the company's guards (`guard_board`, which says only what each record has) and opens each one's record: employee photo, phone, home address, SA ID or passport number, PSIRA number and grade, next of kin. `gate_user_records` has no grants but the service key's; `digigate-people` (`_shared/guard-records.ts`) checks the caller, encrypts the ID number with AES-GCM and finds repeats with a keyed hash, both from the `GUARD_RECORD_KEY` function secret, and logs every opening, change, ID reveal and photo change. The ID number shows by its last four until someone asks to see it, for 30 seconds. Photos are cut to a 3:4 portrait in the browser (which also drops camera metadata) and kept in the private `guard-photos` bucket behind five-minute links. None of it reaches handhelds. Losing `GUARD_RECORD_KEY` loses every ID number; each Supabase project has its own.
- **ID card.** A preview beside the record, turning over to its back: the company's own design in our tokens, with faint fine-line print, a rosette, a ghost copy of the photo and microtext. Printing comes later.
- **Sites, access points and shifts.** Each site's page in Admin edits its access points (the same list as in Companies) and its shift times (`sites.shift_periods`, up to six, HH:MM at the site, checked in core and in the database). Handhelds get the site's name and shift times with their snapshot and keep them for offline restarts.

**Backlog (not until the user asks):** revoking a device on duty (tabled 2026-11-02: the server should close its open shift itself, and a "moving or retiring" revoke should let it upload and end its shift before it wipes; today unsent scans are stranded and the guard shows on duty for up to 14 hours), NFC staff cards (see Registered people), fake-licence detection, "Not me" exit alert for staff and residents, lockdown mode, incident pack for SAPS, scout detection, banned persons and protection orders, remote override approval, guard scorecard, remote device management (remote control, hotspot blocking and Wi-Fi through a device management service, with every device enrolled at a factory reset before it ships), shift handover, paid parking, contractor pre-registration, parking occupancy, daily digest, plain-English search, cross-site watchlist, boom relay, ANPR, phone-camera scanning fallback (the camera library must expose raw bytes, not just text).

## Open decisions

- Gate layout: one lane or separate entry and exit lanes? Devices per gate? Is the pedestrian gate a separate device?
- Connectivity at the gate (Wi-Fi, LTE, none). Shapes sync intervals, and SOS can't work without it.
- Staff cards (for NFC, later): does the hospital already issue them, and are they 13.56 MHz (reusable) or 125 kHz (we issue our own)?
- Visiting hours.
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
| `EXPO_PUBLIC_SUPABASE_URL` | Gate app | Built into the app, which is safe. Without it the app runs on local data only |
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
| Test the database | `pnpm test:db` runs every migration on a real Postgres engine and checks who can reach what |
| Fake gate traffic | `pnpm simulate --site <site id> --history 30` the first time, then `pnpm simulate`. Stands in for one handheld per post, through the real pairing, rules and sync, with made-up people and cars. Test project only. It stops after 8 hours (`--for`), and erases its detail after 24 (`--keep`), leaving only the anonymous daily totals. `pnpm simulate:erase` removes every trace of it |
| Fake companies at volume | Run `supabase/tests/load-test-add.sql`, then `load-test-reports.sql` for their daily totals, and `load-test-remove.sql` to take it all out again |
| Test reports | `pnpm test:reports` draws every kind of report as a PDF and an email from made-up figures. Pass a folder to keep the files |
| Start automated reports on a project (once) | `node supabase/setup/report-schedule.mjs <project ref>` makes the shared secret and a job that runs every 5 minutes |
| Switch on report email | In your own terminal, never in chat: `pnpm dlx supabase secrets set --project-ref <ref> RESEND_API_KEY=<key>`, and once a domain is verified in Resend, `REPORTS_FROM="DigiGate Reports <reports@your-domain>"`. Until then Resend's test sender can only reach the Resend account's own address |
| Gate app in Expo Go on a phone (Wi-Fi) | `pnpm exec expo start --lan --go` in `apps/gate`, then open `exp://<laptop IP>:8081` in Expo Go. `--go` is required now that `expo-dev-client` is installed |
| Development build (cloud) | `eas build --platform android --profile development` in `apps/gate`. Install the APK on the DT50, then run `pnpm exec expo start --localhost --dev-client` (with the IPv4 `NODE_OPTIONS` below) and open it from the dev client |
| DT50 says "There was a problem loading the project" | Unplugging or a USB reset clears the port forward. Run `adb reverse tcp:8081 tcp:8081`, then tap **Reload** |
| Hash a PIN for the seed list | `node scripts/hash-pin.mjs <6-digit PIN>` in `apps/gate` |
| Link the Supabase project (once) | From the repo root: `pnpm dlx supabase init` (creates `supabase/config.toml`, keeps the existing migrations), `pnpm dlx supabase login`, then `pnpm dlx supabase link --project-ref <ref>` |
| Apply database migrations | Paste each new file from `supabase/migrations/`, in order, into the SQL Editor of the DigiGate project. `digigate.schema_version` shows what has run |
| Deploy the device functions | `pnpm functions:bundle`, then `pnpm dlx supabase functions deploy digigate-pair digigate-sync --project-ref fgtuednylvrknqeyxizz --no-verify-jwt`. They have no user login: pairing proves itself with the code, sync with the device token |
| Start the nightly erasure on a project (once) | Apply `20261104160000_digigate_erasure.sql`, then run `supabase/setup/erasure-schedule.sql` (with the project's own address in it) and deploy `digigate-erasure` with `--no-verify-jwt`. Both SQL steps write to Vault, so run them in your own terminal |
| Set up a handheld before it ships | With it on USB and DigiGate installed, in `apps/gate`: `node scripts/provision-device.mjs` (set `ADB` to adb's path). Grants camera, location and notifications, so a guard can't refuse them to dodge the selfie or the geofence |
| Standalone test build | `npx eas-cli@latest build --platform android --profile preview` in `apps/gate`. Runs with no PC, on the `preview` update channel |
| Ship a code-only change over the air | `npx eas-cli@latest update --channel preview --environment preview --message "<what changed>"` in `apps/gate` (`production` for real sites). Handhelds check every 30 minutes and restart onto it only when nobody is signed in or the screen is locked (`src/lib/app-updates.ts`); the shift screen shows which version runs. The fingerprint runtime means an update reaches only builds with the same native code: a new native library, the Urovo SDK or kiosk mode still need a new build |
| Release build for a real site | `eas build --platform android --profile production` in `apps/gate`: no development client, so it can't load code over USB or the network. First set the server address on Expo, since `.env` isn't uploaded: `eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <production project URL> --environment production --visibility plaintext`. Without it the app runs offline-only |
| Gate app dev server (Expo Go over USB) | `adb reverse tcp:8081 tcp:8081`, then in `apps/gate` with `NODE_OPTIONS=--dns-result-order=ipv4first` set: `pnpm exec expo start --localhost`. Open `exp://127.0.0.1:8081` in Expo Go (or `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent`). Without the IPv4 flag, Metro binds only to `::1`, the USB forward can't reach it, and Expo Go shows "Failed to download remote update" |
| Dashboard dev server | `pnpm dashboard dev` |
| Dashboard lint | `pnpm dashboard lint` |
| Landing page dev server (port 3100) | `pnpm home dev` |
| Expo health check | `pnpm dlx expo-doctor@latest` (in `apps/gate`) |
| Add an Expo library | `pnpm exec expo install <pkg>` (in `apps/gate`), never a plain `pnpm add`, so versions match SDK 58 |
| Rebuild icon modules | `pnpm --filter @digigate/design icons`, after the SVGs in `packages/design/assets/icons` change. Generates `src/icons/*.ts`; never edit those by hand |
