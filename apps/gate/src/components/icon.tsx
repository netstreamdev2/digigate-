import { colors } from '@digigate/design';
import add from '@digigate/design/icons/add';
import alerts from '@digigate/design/icons/alerts';
import back from '@digigate/design/icons/back';
import bell from '@digigate/design/icons/bell';
import check from '@digigate/design/icons/check';
import close from '@digigate/design/icons/close';
import contractor from '@digigate/design/icons/contractor';
import delivery from '@digigate/design/icons/delivery';
import device from '@digigate/design/icons/device';
import duration from '@digigate/design/icons/duration';
import emergency from '@digigate/design/icons/emergency';
import entry from '@digigate/design/icons/entry';
import exit from '@digigate/design/icons/exit';
import guard from '@digigate/design/icons/guard';
import idBook from '@digigate/design/icons/id-book';
import idCard from '@digigate/design/icons/id-card';
import info from '@digigate/design/icons/info';
import licenceCard from '@digigate/design/icons/licence-card';
import licenceDisc from '@digigate/design/icons/licence-disc';
import lock from '@digigate/design/icons/lock';
import manualEntry from '@digigate/design/icons/manual-entry';
import occupants from '@digigate/design/icons/occupants';
import offline from '@digigate/design/icons/offline';
import onSite from '@digigate/design/icons/on-site';
import overviewFilled from '@digigate/design/icons/overview-filled';
import override from '@digigate/design/icons/override';
import patientDropoff from '@digigate/design/icons/patient-dropoff';
import pedestrian from '@digigate/design/icons/pedestrian';
import remove from '@digigate/design/icons/remove';
import resultBlocked from '@digigate/design/icons/result-blocked';
import resultClear from '@digigate/design/icons/result-clear';
import resultWarning from '@digigate/design/icons/result-warning';
import ruleVehicleSwap from '@digigate/design/icons/rule-vehicle-swap';
import scan from '@digigate/design/icons/scan';
import staff from '@digigate/design/icons/staff';
import supervisor from '@digigate/design/icons/supervisor';
import synced from '@digigate/design/icons/synced';
import syncing from '@digigate/design/icons/syncing';
import vehicle from '@digigate/design/icons/vehicle';
import visitor from '@digigate/design/icons/visitor';
import Svg, { Path } from 'react-native-svg';

// Only the icons the gate app uses, so the rest of the set stays out of the bundle.
const icons = {
  add,
  alerts,
  back,
  bell,
  check,
  close,
  contractor,
  delivery,
  device,
  duration,
  emergency,
  entry,
  exit,
  guard,
  'id-book': idBook,
  'id-card': idCard,
  info,
  'licence-card': licenceCard,
  'licence-disc': licenceDisc,
  lock,
  'manual-entry': manualEntry,
  occupants,
  offline,
  'on-site': onSite,
  'overview-filled': overviewFilled,
  override,
  'patient-dropoff': patientDropoff,
  pedestrian,
  remove,
  'result-blocked': resultBlocked,
  'result-clear': resultClear,
  'result-warning': resultWarning,
  'rule-vehicle-swap': ruleVehicleSwap,
  scan,
  staff,
  supervisor,
  synced,
  syncing,
  vehicle,
  visitor,
} satisfies Record<string, string>;

export type IconName = keyof typeof icons;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 24, color = colors.ink }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={icons[name]} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
