import { colors, radius, space } from '@digigate/design';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type Props = {
  label: string;
  /** A second line, such as a shift's hours. */
  detail?: string;
  /** What the guard sees beside the label, so the colour is never the only signal. */
  icon: IconName;
  /** A tile colour from the design tokens. */
  tint: keyof typeof colors;
  selected: boolean;
  /** Left out once the choice is locked in. */
  onPress?: () => void;
  /** Icon above the text, for labels too long to sit beside it. */
  stacked?: boolean;
  /** The whole row to itself, for a name too long for half: the text then wraps instead of being cut off. */
  wide?: boolean;
};

// About as many characters as fit on one line of a half-width tile on the DT50.
const HALF_TILE_CHARACTERS = 14;

/**
 * Which tiles in a list get the whole row: any whose name is too long for half, and any short one that would otherwise
 * sit alone in its row, so rows stay even. The order stays as it was set up.
 */
export function wideTiles(labels: readonly string[]): boolean[] {
  const wide = labels.map((label) => label.trim().length > HALF_TILE_CHARACTERS);
  for (let index = 0; index < labels.length; index++) {
    if (wide[index]) continue;
    if (index + 1 < labels.length && !wide[index + 1]) {
      index++;
      continue;
    }
    wide[index] = true;
  }
  return wide;
}

/** One choice as a colour-coded tile with its own icon, two to a row or one when `wide`, large enough for a gloved thumb. */
export function OptionTile({ label, detail, icon, tint, selected, onPress, stacked = false, wide = false }: Props) {
  const upright = stacked && !wide;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        upright && styles.tileStacked,
        wide && styles.tileWide,
        { backgroundColor: colors[tint] },
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.badge}>
        <Icon name={icon} size={22} />
      </View>
      <View style={upright ? null : styles.copy}>
        <Text variant="bodyStrong" numberOfLines={wide ? 3 : 2}>
          {label}
        </Text>
        {detail ? (
          <Text variant="label" color={colors.inkMuted} numberOfLines={wide ? 2 : 1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View style={[styles.tick, upright && styles.tickStacked]}>
          <Icon name="check" size={14} color={colors.inkInverse} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48.5%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: space.sm,
  },
  tileWide: {
    width: '100%',
    paddingVertical: space.sm,
  },
  selected: {
    borderColor: colors.ink,
  },
  pressed: {
    opacity: 0.85,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickStacked: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
  },
});
