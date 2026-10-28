import { colors, radius, shadow } from '@digigate/design';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type Props = {
  icon: IconName;
  label: string;
  tone?: 'light' | 'dark';
  size?: number;
  badge?: number;
  elevated?: boolean;
  onPress?: () => void;
};

export function IconButton({ icon, label, tone = 'light', size = 44, badge, elevated = false, onPress }: Props) {
  const dark = tone === 'dark';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, backgroundColor: dark ? colors.ink : colors.surfaceMuted },
        elevated && styles.elevated,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.46)} color={dark ? colors.inkInverse : colors.ink} />
      {badge ? (
        <View style={styles.badge}>
          <Text variant="overline" color={colors.inkInverse}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  elevated: {
    boxShadow: shadow.floating,
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
