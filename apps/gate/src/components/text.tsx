import { colors, typography } from '@digigate/design';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';

export type TextVariant = keyof typeof typography;

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
};

export function Text({ variant = 'body', color = colors.ink, style, ...props }: Props) {
  return <NativeText {...props} style={[styles.base, typography[variant], { color }, style]} />;
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
});
