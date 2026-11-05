import { occupantTotal, type OccupantsBySex } from '@digigate/core';
import { colors, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { IconButton } from './icon-button';
import { Text } from './text';

type Props = {
  title: string;
  value: OccupantsBySex;
  onChange: (value: OccupantsBySex) => void;
  locked: boolean;
};

/** Just the driver, as their licence says: a man, a woman, or not said. */
export function driverOnly(gender: 'male' | 'female' | null): OccupantsBySex {
  return { male: gender === 'male' ? 1 : 0, female: gender === 'female' ? 1 : 0, unknown: gender === null ? 1 : 0 };
}

const ROWS: readonly { key: keyof OccupantsBySex; label: string }[] = [
  { key: 'male', label: 'Men' },
  { key: 'female', label: 'Women' },
  { key: 'unknown', label: 'Not sure' },
];

/** The people in a car, counted as men, women and anyone the guard can't tell. Counts only: there's always at least the driver. */
export function OccupantCounter({ title, value, onChange, locked }: Props) {
  const total = occupantTotal(value);
  const change = (key: keyof OccupantsBySex, by: number) => onChange({ ...value, [key]: Math.max(0, value[key] + by) });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="label" color={colors.inkMuted}>
            Including the driver
          </Text>
        </View>
        <Text variant="stat" accessibilityLabel={`${total} ${total === 1 ? 'person' : 'people'} in all`}>
          {total}
        </Text>
      </View>
      {ROWS.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text variant="body" style={styles.label}>
            {row.label}
          </Text>
          <View style={styles.stepper}>
            <IconButton
              icon="remove"
              label={`One ${row.label.toLowerCase()} fewer`}
              onPress={!locked && value[row.key] > 0 && total > 1 ? () => change(row.key, -1) : undefined}
            />
            <Text variant="title" style={styles.count}>
              {value[row.key]}
            </Text>
            <IconButton icon="add" label={`One more: ${row.label.toLowerCase()}`} onPress={!locked ? () => change(row.key, 1) : undefined} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  count: {
    minWidth: 28,
    textAlign: 'center',
  },
});
