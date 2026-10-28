import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { demoExit, demoGuard } from '@/demo/gate-demo';

const FOOTER_HEIGHT = 160;

export default function ExitScreen() {
  const insets = useSafeAreaInsets();
  const { driver, arrivedIn, leavingIn } = demoExit;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_HEIGHT }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label={`${demoGuard.gate} · Exit`} icon="exit" />
        </View>

        <View style={styles.heading}>
          <Text variant="overline" color={colors.inkMuted}>
            Vehicle exit
          </Text>
          <Text variant="display">{"Who's leaving?"}</Text>
        </View>

        <ResultBanner
          tone="blocked"
          title="Blocked"
          message="Vehicle swap. This driver arrived in a different car. Keep the boom closed."
        />

        <Card style={styles.driver}>
          <View style={styles.avatar}>
            <Text variant="heading" color={colors.brand}>
              {driver.initials}
            </Text>
          </View>
          <View style={styles.driverCopy}>
            <Text variant="heading">{driver.name}</Text>
            <Text variant="label" color={colors.inkMuted}>
              {`Driver · on site ${driver.timeOnSite}`}
            </Text>
          </View>
          <Icon name="licence-card" size={24} color={colors.inkMuted} />
        </Card>

        <Card style={styles.compare}>
          <VehicleRow caption="Arrived in" vehicle={arrivedIn.vehicle} detail={`${arrivedIn.plate} · in at ${arrivedIn.time}`} />
          <View style={styles.swapRow}>
            <View style={styles.swapLine} />
            <View style={styles.swapBadge}>
              <Icon name="rule-vehicle-swap" size={20} color={colors.blocked} />
            </View>
            <View style={styles.swapLine} />
          </View>
          <VehicleRow caption="Trying to leave in" vehicle={leavingIn.vehicle} detail={leavingIn.plate} flagged />
        </Card>

        <Card style={styles.context}>
          <Icon name="info" size={22} color={colors.brand} />
          <Text variant="body" style={styles.contextCopy}>
            {`This ${leavingIn.vehicle} came in with ${leavingIn.entryDriver} at ${leavingIn.entryTime} and hasn't left yet.`}
          </Text>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <PillButton label="Call supervisor" icon="supervisor" />
        <PillButton label="Supervisor override" icon="override" variant="secondary" />
      </View>
    </View>
  );
}

type VehicleRowProps = {
  caption: string;
  vehicle: string;
  detail: string;
  flagged?: boolean;
};

function VehicleRow({ caption, vehicle, detail, flagged = false }: VehicleRowProps) {
  return (
    <View style={styles.vehicle}>
      <View style={[styles.vehicleIcon, { backgroundColor: flagged ? colors.blockedSoft : colors.surfaceMuted }]}>
        <Icon name="vehicle" size={22} color={flagged ? colors.blocked : colors.ink} />
      </View>
      <View style={styles.vehicleCopy}>
        <Text variant="overline" color={flagged ? colors.blocked : colors.inkMuted}>
          {caption}
        </Text>
        <Text variant="bodyStrong">{vehicle}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    gap: space.xs,
  },
  driver: {
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
  driverCopy: {
    flex: 1,
    gap: 2,
  },
  compare: {
    gap: space.xs,
  },
  vehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCopy: {
    flex: 1,
    gap: 2,
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  swapLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  swapBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.blockedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  context: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: colors.tileSky,
    borderColor: colors.tileSky,
  },
  contextCopy: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    gap: space.xs,
    backgroundColor: colors.background,
  },
});
