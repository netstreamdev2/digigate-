import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

const tones = {
  clear: { background: colors.clear, icon: 'result-clear' },
  warning: { background: colors.warning, icon: 'result-warning' },
  blocked: { background: colors.blocked, icon: 'result-blocked' },
} as const satisfies Record<string, { background: string; icon: IconName }>;

type Props = {
  tone: keyof typeof tones;
  title: string;
  message: string;
  /** Smaller, for a notice that shares a screen with a keypad or a list, so it never pushes them off the bottom. */
  compact?: boolean;
};

export function ResultBanner({ tone, title, message, compact = false }: Props) {
  const { background, icon } = tones[tone];

  return (
    <View accessibilityRole="alert" style={[styles.banner, compact && styles.compact, { backgroundColor: background }]}>
      <Icon name={icon} size={compact ? 24 : 40} color={colors.inkInverse} />
      <View style={styles.copy}>
        <Text variant={compact ? 'bodyStrong' : 'title'} color={colors.inkInverse}>
          {title}
        </Text>
        <Text variant={compact ? 'label' : 'body'} color={colors.inkInverse}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
  },
  compact: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
