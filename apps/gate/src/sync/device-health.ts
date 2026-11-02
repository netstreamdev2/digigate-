import { applicationLibrary, batteryLibrary, locationLibrary, netInfoLibrary } from '@/lib/native';
import { latestReading } from '@/shift/post-fence';

import { DeviceSignal } from '../../modules/device-signal';

/** What the control room sees of a handheld. Its position is overwritten each round, so it never becomes a trail. */
export type DeviceHealth = {
  battery?: number;
  charging?: boolean;
  appVersion?: string;
  network?: 'wifi' | 'cellular' | 'none' | 'other';
  wifiName?: string;
  wifiStrength?: number;
  cellGeneration?: string;
  cellBars?: number;
  locationAllowed?: boolean;
  latitude?: number;
  longitude?: number;
  fixAt?: number;
};

const UNKNOWN_WIFI = '<unknown ssid>';

/** A report is a best effort: whatever can't be read this round is left out, and a sync never fails because of it. */
async function reading<T>(read: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

async function batteryHealth(): Promise<DeviceHealth> {
  if (!batteryLibrary) return {};
  const { getBatteryLevelAsync, getBatteryStateAsync, BatteryState } = batteryLibrary;
  const [level, state] = await Promise.all([reading(getBatteryLevelAsync), reading(getBatteryStateAsync)]);
  return {
    // A negative level means Android doesn't know.
    battery: level !== undefined && level >= 0 ? Math.round(level * 100) : undefined,
    charging: state === undefined || state === BatteryState.UNKNOWN ? undefined : state !== BatteryState.UNPLUGGED,
  };
}

async function networkHealth(): Promise<DeviceHealth> {
  if (!netInfoLibrary) return {};
  const state = await reading(() => netInfoLibrary?.fetch());
  if (!state) return {};
  if (state.type === 'wifi') {
    const { ssid, strength } = state.details;
    return { network: 'wifi', wifiName: ssid && ssid !== UNKNOWN_WIFI ? ssid : undefined, wifiStrength: strength ?? undefined };
  }
  if (state.type === 'cellular') return { network: 'cellular', cellGeneration: state.details.cellularGeneration ?? undefined };
  return { network: state.type === 'none' ? 'none' : 'other' };
}

async function locationHealth(): Promise<DeviceHealth> {
  if (!locationLibrary) return {};
  const permission = await reading(locationLibrary.getForegroundPermissionsAsync);
  const switchedOn = await reading(locationLibrary.hasServicesEnabledAsync);
  const locationAllowed = permission?.granted === true && switchedOn === true;
  if (!locationAllowed) return { locationAllowed };

  const onShift = latestReading();
  if (onShift) return { locationAllowed, latitude: onShift.latitude, longitude: onShift.longitude, fixAt: onShift.at };
  const known = await reading(() => locationLibrary?.getLastKnownPositionAsync());
  return known ? { locationAllowed, latitude: known.coords.latitude, longitude: known.coords.longitude, fixAt: known.timestamp } : { locationAllowed };
}

function cellBars(): number | undefined {
  try {
    return DeviceSignal?.cellBars() ?? undefined;
  } catch {
    return undefined;
  }
}

export async function readDeviceHealth(): Promise<DeviceHealth> {
  const [battery, network, location] = await Promise.all([batteryHealth(), networkHealth(), locationHealth()]);
  return {
    ...battery,
    ...network,
    ...location,
    appVersion: applicationLibrary?.nativeApplicationVersion ?? undefined,
    cellBars: cellBars(),
  };
}
