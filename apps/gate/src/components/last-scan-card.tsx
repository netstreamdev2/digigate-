import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { Chip } from './chip';
import { Text } from './text';

type Field = {
  label: string;
  value: string;
};

type Props = {
  name: string;
  initials: string;
  visitType: string;
  direction: 'in' | 'out';
  time: string;
  fields: readonly Field[];
};

export function LastScanCard({ name, initials, visitType, direction, time, fields }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="overline" color={colors.inkMuted}>
          Last scan
        </Text>
        <Text variant="label" color={colors.inkMuted}>
          {time}
        </Text>
      </View>

      <View style={styles.person}>
        <View style={styles.avatar}>
          <Text variant="heading" color={colors.brand}>
            {initials}
          </Text>
        </View>
        <View style={styles.identity}>
          <Text variant="heading">{name}</Text>
          <Text variant="overline" color={colors.brand}>
            {visitType}
          </Text>
        </View>
        <Chip label={direction === 'in' ? 'In' : 'Out'} icon={direction === 'in' ? 'entry' : 'exit'} tone="clear" />
      </View>

      <View style={styles.fields}>
        {fields.map((field) => (
          <View key={field.label} style={styles.field}>
            <Text variant="overline" color={colors.inkSubtle}>
              {field.label}
            </Text>
            <Text variant="bodyStrong">{field.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.tileLilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md,
  },
  field: {
    width: '50%',
    gap: 2,
  },
});
