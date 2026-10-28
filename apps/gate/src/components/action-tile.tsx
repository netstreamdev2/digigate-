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
  onPress?: () => void;
};

export function ActionTile({ icon, label, detail, tint, outlined = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, { backgroundColor: tint }, outlined && styles.outlined, pressed && styles.pressed]}>
      <View style={styles.badge}>
        <Icon name={icon} size={24} />
      </View>
      <Text variant="heading">{label}</Text>
      <Text variant="label" color={colors.inkMuted}>
        {detail}
      </Text>
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
});
