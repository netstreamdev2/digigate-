import { colors, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import type { SyncedBooking } from '@/db/watch-lists';
import { titleCase } from '@/lib/format';

/** The booking that expects someone: who, why, the company's note, and what the guard does next. */
export function ExpectedCard({ booking, next }: { booking: SyncedBooking; next: string }) {
  const detail = [booking.visitType ? titleCase(booking.visitType.replace(/_/g, ' ')) : null, booking.note, next]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');

  return (
    <Card style={styles.card}>
      <Icon name="visitor" size={22} color={colors.brand} />
      <View style={styles.copy}>
        <Text variant="bodyStrong">{`Expected: ${titleCase(booking.name)}`}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
