import { colors, radius, space } from '@digigate/design';
import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type Props = {
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  onPress?: () => void;
};

export function PillButton({ label, icon, variant = 'primary', disabled = false, onPress }: Props) {
  const primary = variant === 'primary';
  const foreground = primary ? colors.inkInverse : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {icon ? <Icon name={icon} size={22} color={foreground} /> : null}
      <Text variant="heading" color={foreground}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 58,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  primary: {
    backgroundColor: colors.ink,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.35,
  },
});
