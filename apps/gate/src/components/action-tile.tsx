import { colors, radius, space } from '@digigate/design';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type Props = {
  icon: IconName;
  label: string;
  detail: string;
  tint: string;
  outlined?: boolean;
  /** Half height, icon beside the label: two compact tiles fill the space of one. */
  compact?: boolean;
  onPress?: () => void;
};

export function ActionTile({ icon, label, detail, tint, outlined = false, compact = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        compact ? styles.compact : styles.tile,
        { backgroundColor: tint },
        outlined && styles.outlined,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.badge, compact && styles.badgeCompact]}>
        <Icon name={icon} size={compact ? 18 : 24} />
      </View>
      <View style={compact ? styles.copyCompact : styles.copy}>
        <Text variant={compact ? 'bodyStrong' : 'heading'}>{label}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 148,
    padding: space.md,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
  },
  compact: {
    minHeight: 70,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  badge: {
    width: 52,
    height: 52,
    marginBottom: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: {
    width: 32,
    height: 32,
    marginBottom: 0,
  },
  copy: {
    alignItems: 'center',
    gap: space.xxs,
  },
  copyCompact: {
    flex: 1,
    gap: 2,
  },
});
