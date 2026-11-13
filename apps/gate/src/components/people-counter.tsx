import { colors, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { IconButton } from './icon-button';
import { Text } from './text';

/** A car always has its driver; more than this in one car is a typing slip. */
const FEWEST = 1;
const MOST = 60;

type Props = {
  title: string;
  value: number;
  onChange: (value: number) => void;
  locked: boolean;
};

/** How many people are in the car, the driver included: one number, two big buttons. */
export function PeopleCounter({ title, value, onChange, locked }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.copy}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="label" color={colors.inkMuted}>
          Including the driver
        </Text>
      </View>
      <View style={styles.stepper}>
        <IconButton icon="remove" label="One person fewer" onPress={!locked && value > FEWEST ? () => onChange(value - 1) : undefined} />
        <Text variant="stat" style={styles.count} accessibilityLabel={`${value} ${value === 1 ? 'person' : 'people'}`}>
          {value}
        </Text>
        <IconButton icon="add" label="One more person" onPress={!locked && value < MOST ? () => onChange(value + 1) : undefined} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  count: {
    minWidth: 44,
    textAlign: 'center',
  },
});
