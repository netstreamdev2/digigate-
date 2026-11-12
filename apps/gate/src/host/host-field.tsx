import { colors, radius, space, typography } from '@digigate/design';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';

/** A labelled text field in the app's own style, large enough for a thumb. */
export function HostField({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text variant="label" color={colors.inkMuted}>
        {label}
      </Text>
      <TextInput placeholderTextColor={colors.inkSubtle} {...input} style={styles.input} accessibilityLabel={label} />
      {hint ? (
        <Text variant="label" color={colors.inkSubtle}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space.xs,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.body,
  },
});
