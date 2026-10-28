import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useSync, type SyncStatus } from '@/sync/sync-context';

import { Icon, type IconName } from './icon';
import { Text } from './text';

const tones = {
  clear: { background: colors.clearSoft, foreground: colors.clear },
  warning: { background: colors.warningSoft, foreground: colors.warning },
  neutral: { background: colors.surfaceMuted, foreground: colors.inkMuted },
} as const;

type Look = {
  label: string;
  icon: IconName;
  tone: keyof typeof tones;
  onPress?: () => void;
};

function lookFor(status: SyncStatus, pending: number): Look {
  switch (status.state) {
    case 'local-only':
      return { label: 'This device only', icon: 'device', tone: 'neutral' };
    case 'not-paired':
      return { label: 'Pair device', icon: 'offline', tone: 'warning', onPress: () => router.push('/pair') };
    case 'syncing':
      return { label: 'Syncing', icon: 'syncing', tone: 'neutral' };
    case 'synced':
      return pending === 0
        ? { label: 'Synced', icon: 'synced', tone: 'clear' }
        : { label: `${pending} to upload`, icon: 'syncing', tone: 'neutral' };
    case 'offline':
      return { label: pending > 0 ? `Offline · ${pending} waiting` : 'Offline', icon: 'offline', tone: 'warning' };
  }
}

export function SyncPill() {
  const { status, pendingEvents } = useSync();
  const look = lookFor(status, pendingEvents);
  const { background, foreground } = tones[look.tone];

  return (
    <Pressable
      onPress={look.onPress}
      disabled={!look.onPress}
      accessibilityRole={look.onPress ? 'button' : 'text'}
      accessibilityLabel={look.label}
      style={[styles.pill, { backgroundColor: background }]}>
      <Icon name={look.icon} size={16} color={foreground} />
      <Text variant="label" color={foreground}>
        {look.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
