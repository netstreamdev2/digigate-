import { colors, radius, space } from '@digigate/design';
import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

const tones = {
  neutral: { background: colors.surfaceMuted, foreground: colors.ink },
  selected: { background: colors.ink, foreground: colors.inkInverse },
  clear: { background: colors.clearSoft, foreground: colors.clear },
  blocked: { background: colors.blockedSoft, foreground: colors.blocked },
} as const;

type Props = {
  label: string;
  tone?: keyof typeof tones;
  icon?: IconName;
  onPress?: () => void;
};

export function Chip({ label, tone = 'neutral', icon, onPress }: Props) {
  const { background, foreground } = tones[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: tone === 'selected' }}
      style={({ pressed }) => [styles.chip, { backgroundColor: background }, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={16} color={foreground} /> : null}
      <Text variant="label" color={foreground}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});
