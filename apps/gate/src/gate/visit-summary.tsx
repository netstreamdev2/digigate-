import { colors, radius, space } from '@digigate/design';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { VisitTypeBadge } from '@/components/visit-type-picker';
import { formatArrival, formatDuration, formatPlate } from '@/lib/format';

import { useNow, type PersonVisits } from './use-person-visits';

const MINUTE = 60_000;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color={colors.inkMuted} style={styles.rowLabel}>
        {label}
      </Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

/**
 * The visit of someone leaving on foot: how long they've been on site, when they came, why and how. Shown as soon
 * as they're scanned. With no open visit it says so plainly, before the rules flag it.
 */
export function VisitSummary({ visits }: { visits: PersonVisits }) {
  const now = useNow(MINUTE);
  if (visits.status === 'idle' || visits.status === 'loading') return null;
  if (visits.status === 'failed') {
    return (
      <Card style={[styles.card, styles.missing]}>
        <Text variant="bodyStrong">{"Couldn't look up their visit"}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {`Press Check: the rules will still run. (${visits.message})`}
        </Text>
      </Card>
    );
  }

  // Someone on foot is matched with their own walk-in; a driver who walks out, with the car they brought.
  const visit = visits.visits.find((candidate) => candidate.kind === 'pedestrian') ?? visits.visits[0];
  if (!visit) {
    return (
      <Card style={[styles.card, styles.missing]}>
        <View style={styles.missingTitle}>
          <Icon name="result-warning" size={22} color={colors.warning} />
          <Text variant="bodyStrong">No record of them coming in</Text>
        </View>
        <Text variant="label" color={colors.inkMuted}>
          They may have arrived as a passenger, or come through another gate.
        </Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text variant="overline" color={colors.inkMuted}>
        Their visit
      </Text>
      <View style={styles.stay}>
        <View style={styles.stayIcon}>
          <Icon name="duration" size={26} color={colors.brand} />
        </View>
        <View>
          <Text variant="label" color={colors.inkMuted}>
            On site for
          </Text>
          <Text variant="title">{formatDuration(now - visit.enteredAt)}</Text>
        </View>
      </View>
      <View style={styles.rows}>
        <Row label="Came in">
          <Text variant="bodyStrong">{formatArrival(visit.enteredAt, now)}</Text>
        </Row>
        <Row label="Reason">
          <VisitTypeBadge code={visit.visitType} />
        </Row>
        <Row label="Came by">
          {visit.kind === 'pedestrian' ? (
            <View style={styles.how}>
              <Icon name="pedestrian" size={18} />
              <Text variant="bodyStrong">On foot</Text>
            </View>
          ) : (
            <View style={styles.how}>
              <Icon name="vehicle" size={18} />
              <Text variant="bodyStrong" style={styles.howCopy}>
                {[visit.vehicleDescription, visit.plate ? formatPlate(visit.plate) : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}
        </Row>
      </View>
      {visit.kind === 'vehicle' ? (
        <View style={styles.note}>
          <Icon name="info" size={18} color={colors.brand} />
          <Text variant="label" style={styles.howCopy}>
            They drove in and the car is still on site.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  missing: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningSoft,
    gap: space.xs,
  },
  missingTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  stay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  stayIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tileSky,
  },
  rows: {
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowLabel: {
    width: 72,
  },
  rowValue: {
    flex: 1,
  },
  how: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  howCopy: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.tileSky,
  },
});
