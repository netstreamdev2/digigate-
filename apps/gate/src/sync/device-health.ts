import { applicationLibrary, batteryLibrary, locationLibrary, netInfoLibrary } from '@/lib/native';
import { latestReading } from '@/shift/post-fence';

import { gatePolicy } from '@/device/gate-policy';

import { DeviceSignal, type SimState } from '../../modules/device-signal';

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
  /** Whether DigiGate owns the handheld and holds it to the gate policy, and any step Android refused. */
  managed?: boolean;
  policyProblems?: string[];
  simState?: SimState;
  simOperator?: string;
  networkOperator?: string;
  roaming?: boolean;
  dataEnabled?: boolean;
  /** Mobile data by local day: the whole handheld's, when Android allows, and DigiGate's own. */
  mobileData?: DayOfData[];
};

export type DayOfData = { day: string; device: number | null; app: number | null };

/** Today and yesterday each round, which is all that changes; the whole stretch once a day and after each start. */
const RECENT_DAYS = 2;
const HISTORY_DAYS = 35;
let historySentOn: string | null = null;

const twoDigits = (value: number) => String(value).padStart(2, '0');
const dayKey = (date: Date) => `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

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

async function dataHealth(): Promise<DeviceHealth> {
  const signal = DeviceSignal;
  if (!signal) return {};
  const sim = await reading(() => signal.sim());
  const now = new Date();
  const today = dayKey(now);
  const count = historySentOn === today ? RECENT_DAYS : HISTORY_DAYS;
  // Local midnights, so a day is the handheld's own day, as the control room reads it.
  const days = Array.from({ length: count }, (_, back) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  const usage = await reading(() => signal.mobileData(days.map((start) => [start.getTime(), start.getTime() + 86_400_000] as [number, number])));
  if (usage && count === HISTORY_DAYS) historySentOn = today;
  return {
    ...(sim
      ? {
          simState: sim.state,
          simOperator: sim.simOperator ?? undefined,
          networkOperator: sim.networkOperator ?? undefined,
          roaming: sim.roaming,
          dataEnabled: sim.dataEnabled ?? undefined,
        }
      : {}),
    mobileData: usage?.flatMap((day, index) => {
      const start = days[index];
      return start ? [{ day: dayKey(start), device: day.device, app: day.app }] : [];
    }),
  };
}

function policyHealth(): DeviceHealth {
  const policy = gatePolicy();
  return policy.kind === 'managed' ? { managed: true, policyProblems: policy.problems } : { managed: false };
}

function cellBars(): number | undefined {
  try {
    return DeviceSignal?.cellBars() ?? undefined;
  } catch {
    return undefined;
  }
}

export async function readDeviceHealth(): Promise<DeviceHealth> {
  const [battery, network, location, data] = await Promise.all([batteryHealth(), networkHealth(), locationHealth(), dataHealth()]);
  return {
    ...battery,
    ...network,
    ...location,
    ...data,
    ...policyHealth(),
    appVersion: applicationLibrary?.nativeApplicationVersion ?? undefined,
    cellBars: cellBars(),
  };
}
