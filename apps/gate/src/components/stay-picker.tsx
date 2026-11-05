import { expectedStayLabel, STAY_CHOICES } from '@digigate/core';
import { colors, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Chip } from './chip';
import { Text } from './text';

type Props = {
  value: number | null;
  onChange: (minutes: number | null) => void;
  locked: boolean;
};

/**
 * How long the visit should last. The visit type picks a stay; the guard asks and changes it if they'll be longer or
 * shorter. Past it, the control room sees the visit as over its time.
 */
export function StayPicker({ value, onChange, locked }: Props) {
  // The visit type's own stay may not be one of the usual choices, so it's always offered.
  const choices = STAY_CHOICES.includes(value) ? STAY_CHOICES : [...STAY_CHOICES.slice(0, -1), value, null];
  return (
    <View style={styles.section} accessibilityRole="radiogroup">
      <View style={styles.heading}>
        <Text variant="overline" color={colors.inkMuted}>
          Expected stay
        </Text>
        {locked ? null : (
          <Text variant="label" color={colors.inkMuted}>
            Ask how long they&apos;ll be
          </Text>
        )}
      </View>
      <View style={styles.chips}>
        {locked ? (
          <Chip label={expectedStayLabel(value)} icon="duration" tone="selected" />
        ) : (
          choices.map((minutes) => (
            <Chip key={minutes ?? 'none'} label={expectedStayLabel(minutes)} tone={minutes === value ? 'selected' : 'neutral'} onPress={() => onChange(minutes)} />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
});
