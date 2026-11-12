import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';

/**
 * Over everything while the company is suspended: nothing behind it can be reached, and scans go nowhere. It lifts by
 * itself at the next sync after the company is reinstated.
 */
export function SuspendedCover({ reason }: { reason: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="alert" style={[styles.cover, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
      <Logo height={30} />
      <View style={styles.body}>
        <View style={styles.badge}>
          <Icon name="lock" size={36} color={colors.blocked} />
        </View>
        <Text variant="display">DigiGate is paused</Text>
        <Text variant="body" color={colors.inkMuted}>
          This company&apos;s DigiGate service is suspended, so this handheld can&apos;t check anyone in or out. Anything it already
          recorded is still being kept and sent.
        </Text>
        {reason ? (
          <View style={styles.reason}>
            <Text variant="label" color={colors.inkMuted}>
              Reason given
            </Text>
            <Text variant="bodyStrong">{reason}</Text>
          </View>
        ) : null}
        <Text variant="bodyStrong">Tell your supervisor. Use the site&apos;s paper register until it&apos;s back.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
    gap: space.xl,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: space.md,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.blockedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
