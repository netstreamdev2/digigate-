// Gets a handheld ready before it goes to a site: grants DigiGate the permissions it needs up front, so a guard can't
// refuse the camera to dodge the shift selfie, or location to switch off the geofence. Kiosk mode, when it comes, keeps
// them from taking it back in Settings. Run with the handheld on USB, from apps/gate:
//   node scripts/provision-device.mjs
// ADB is found on PATH, or set ADB to its full path.
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB ?? 'adb';
const PACKAGE = 'com.digigate.gate';
const PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' });

const devices = adb('devices').split('\n').slice(1).filter((line) => line.trim().endsWith('device'));
if (devices.length !== 1) {
  console.error(devices.length === 0 ? 'No handheld on USB.' : 'More than one handheld on USB: connect only the one to set up.');
  process.exit(1);
}
if (!adb('shell', 'pm', 'list', 'packages', PACKAGE).includes(`package:${PACKAGE}`)) {
  console.error('DigiGate is not installed on this handheld. Install it first.');
  process.exit(1);
}

for (const permission of PERMISSIONS) adb('shell', 'pm', 'grant', PACKAGE, permission);

const granted = adb('shell', 'dumpsys', 'package', PACKAGE);
const missing = PERMISSIONS.filter((permission) => !new RegExp(`${permission.replaceAll('.', '\\.')}: granted=true`).test(granted));
if (missing.length > 0) {
  console.error(`Still not granted: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`DigiGate has camera, location and notifications on ${devices[0].split(/\s+/)[0]}.`);

// A gate handheld is set up with no Google account, so Google's setup wizard keeps a "setup in progress" notification
// that can't be swiped away. Once setup is finished it has nothing left to do: switch it off. A factory reset brings it
// back.
const SETUP_WIZARD = 'com.google.android.setupwizard';
const setupDone = adb('shell', 'settings', 'get', 'secure', 'user_setup_complete').trim() === '1';
if (setupDone && adb('shell', 'pm', 'list', 'packages', '-e', SETUP_WIZARD).includes(`package:${SETUP_WIZARD}`)) {
  adb('shell', 'pm', 'disable-user', '--user', '0', SETUP_WIZARD);
  console.log("Switched off Google's setup wizard, and its \"setup in progress\" notification with it.");
}

// Urovo's firmware updater keeps a "Checking for system updates" notification and installs firmware on its own. A
// gate handheld takes firmware only when someone chooses to, since an update can change how the scanner behaves:
// switch it off here, and on again over USB (pm enable com.ubx.update) to update deliberately.
const UROVO_UPDATER = 'com.ubx.update';
if (adb('shell', 'pm', 'list', 'packages', '-e', UROVO_UPDATER).includes(`package:${UROVO_UPDATER}`)) {
  adb('shell', 'pm', 'disable-user', '--user', '0', UROVO_UPDATER);
  console.log('Switched off Urovo\'s firmware updater: firmware comes only when someone chooses it.');
}
