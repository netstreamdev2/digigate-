import { colors, radius, space } from '@digigate/design';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import type { NumberTile } from '@/db/gate-users';

type Props = {
  tiles: readonly NumberTile[];
  /** Employee numbers on duty on another handheld: shown, but greyed out and not tappable. */
  busy: ReadonlySet<string>;
  onPick: (employeeNumber: string) => void;
};

/**
 * The employee numbers on this handheld as big tiles, so a guard taps theirs instead of typing it (13 November). A
 * number already on duty on another handheld is greyed out: one number, one handheld.
 */
export function NumberTiles({ tiles, busy, onPick }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
      {tiles.map((tile) => {
        const taken = busy.has(tile.id);
        return (
          <Pressable
            key={tile.id}
            disabled={taken}
            onPress={() => onPick(tile.employeeNumber)}
            accessibilityRole="button"
            accessibilityState={{ disabled: taken }}
            accessibilityLabel={taken ? `${tile.employeeNumber}, on duty on another handheld` : `${tile.employeeNumber}, ${tile.firstName}`}
            style={({ pressed }) => [styles.tile, taken && styles.taken, pressed && styles.pressed]}>
            <Text variant="title" color={taken ? colors.inkSubtle : colors.ink} style={styles.number}>
              {tile.employeeNumber}
            </Text>
            <Text variant="label" color={taken ? colors.inkSubtle : colors.inkMuted} numberOfLines={1}>
              {taken ? 'On duty elsewhere' : tile.firstName}
            </Text>
          </Pressable>
        );
      })}
      {/* Keeps the last row's tiles the same width as the rest. */}
      <View style={styles.filler} />
      <View style={styles.filler} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.sm,
    paddingBottom: space.sm,
  },
  tile: {
    width: '31.5%',
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  taken: {
    opacity: 0.45,
  },
  pressed: {
    backgroundColor: colors.border,
  },
  number: {
    letterSpacing: 1,
  },
  filler: {
    width: '31.5%',
  },
});
