import { colors, radius, space } from '@digigate/design';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { Text } from './text';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

type Props = {
  onDigit(digit: string): void;
  onDelete(): void;
  disabled?: boolean;
};

// Keys fire on press-in rather than release, so typing a PIN feels instant.
export function Keypad({ onDigit, onDelete, disabled = false }: Props) {
  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((digit) => (
            <Key key={digit} label={digit} disabled={disabled} onPress={() => onDigit(digit)} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.spacer} />
        <Key label="0" disabled={disabled} onPress={() => onDigit('0')} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          disabled={disabled}
          onPressIn={onDelete}
          style={({ pressed }) => [styles.key, styles.plain, pressed && styles.pressed]}>
          <Icon name="back" size={28} />
        </Pressable>
      </View>
    </View>
  );
}

function Key({ label, disabled, onPress }: { label: string; disabled: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={onPress}
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}>
      <Text variant="title">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  spacer: {
    flex: 1,
  },
  key: {
    flex: 1,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {
    backgroundColor: colors.background,
  },
  pressed: {
    backgroundColor: colors.border,
  },
});
