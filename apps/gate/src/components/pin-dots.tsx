import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { PIN_LENGTH } from '@/auth/pin';

/** How many PIN digits are in, never which ones. */
export function PinDots({ filled }: { filled: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`${filled} of ${PIN_LENGTH} digits entered`}>
      {Array.from({ length: PIN_LENGTH }, (_, index) => (
        <View key={index} style={[styles.dot, index < filled && styles.dotFilled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    gap: space.md,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.inkSubtle,
  },
  dotFilled: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
});
