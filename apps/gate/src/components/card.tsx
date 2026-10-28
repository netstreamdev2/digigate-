import { colors, radius, shadow, space } from '@digigate/design';
import { StyleSheet, View, type ViewProps } from 'react-native';

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    boxShadow: shadow.card,
  },
});
