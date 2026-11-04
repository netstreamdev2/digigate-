import type { CarParkState } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { Text } from './text';

/** How full it reads, by colour and by word together, never by colour alone. */
function lookOf(state: CarParkState): { tint: string; word: string | null } {
  if (state.kind !== 'counted') return { tint: colors.tileMint, word: null };
  if (state.full) return { tint: colors.blockedSoft, word: 'Full' };
  if (state.nearlyFull) return { tint: colors.warningSoft, word: 'Filling up' };
  return { tint: colors.tileMint, word: null };
}

function Half({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.half}>
      <Text variant="stat">{value}</Text>
      <Text variant="overline" color={colors.inkMuted}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The car park on home, in two halves: spaces free over cars parked, with a bar for how full it is. For reading only:
 * a full car park never stops a scan.
 */
export function ParkingTile({ state }: { state: CarParkState }) {
  const look = lookOf(state);
  const summary =
    state.kind === 'counted'
      ? `Parking: ${state.free} of ${state.spaces} spaces free, ${state.parked} cars parked${look.word ? `. ${look.word}` : ''}`
      : state.kind === 'open'
        ? `Open parking, ${state.parked} cars parked`
        : 'Parking not synced yet';
  return (
    <View accessible accessibilityLabel={summary} style={[styles.tile, { backgroundColor: look.tint }]}>
      <View style={styles.header}>
        <Icon name="parking" size={18} />
        <Text variant="bodyStrong">{look.word ?? 'Parking'}</Text>
      </View>
      {state.kind === 'counted' ? (
        <>
          <Half value={String(state.free)} label="Spaces free" />
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${Math.min(100, Math.round((state.parked / state.spaces) * 100))}%`, backgroundColor: state.full ? colors.blocked : state.nearlyFull ? colors.warning : colors.clear }]} />
          </View>
          <Half value={String(state.parked)} label="Parked" />
        </>
      ) : state.kind === 'open' ? (
        <>
          <Half value="Open" label="No count kept" />
          <View style={styles.divider} />
          <Half value={String(state.parked)} label="Parked" />
        </>
      ) : (
        <Text variant="label" color={colors.inkMuted}>
          Not synced yet
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 148,
    padding: space.md,
    borderRadius: radius.xl,
    justifyContent: 'center',
    gap: space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
  half: {
    gap: 2,
  },
  bar: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
