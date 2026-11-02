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
