import { colors, radius, shadow, space } from '@digigate/design';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionTile } from '@/components/action-tile';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { LastScanCard } from '@/components/last-scan-card';
import { Logo } from '@/components/logo';
import { StatStrip } from '@/components/stat-strip';
import { Text } from '@/components/text';
import { demoGuard, demoLastScan, demoSiteStats } from '@/demo/gate-demo';

const DOCK_HEIGHT = 156;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + DOCK_HEIGHT }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onLongPress={() => router.push('/scan-test')}
            delayLongPress={600}
            accessibilityRole="button"
            accessibilityLabel="DigiGate. Long-press to open the scanner test.">
            <Logo height={26} />
          </Pressable>
          <View style={styles.topActions}>
            <View style={styles.syncPill}>
              <Icon name="synced" size={16} color={colors.clear} />
              <Text variant="label" color={colors.clear}>
                Synced
              </Text>
            </View>
            <IconButton icon="bell" label={`${demoSiteStats.openAlerts} open alerts`} badge={demoSiteStats.openAlerts} />
          </View>
        </View>

        <View style={styles.greeting}>
          <Text variant="display">{`Hi ${demoGuard.firstName},\nwho's at the gate?`}</Text>
          <Text variant="label" color={colors.inkMuted}>
            {`${demoGuard.gate} · ${demoGuard.lane} · ${demoGuard.shift}`}
          </Text>
        </View>

        <View style={styles.tiles}>
          <View style={[styles.column, styles.columnOffset]}>
            <ActionTile
              icon="entry"
              label="Entry"
              detail="Car coming in"
              tint={colors.tileSky}
              onPress={() => router.push('/entry')}
            />
            <ActionTile icon="pedestrian" label="Walk-in" detail="On foot" tint={colors.tileMint} />
          </View>
          <View style={styles.column}>
            <ActionTile
              icon="exit"
              label="Exit"
              detail="Car leaving"
              tint={colors.surfaceMuted}
              outlined
              onPress={() => router.push('/exit')}
            />
            <ActionTile
              icon="alerts"
              label="Alerts"
              detail={`${demoSiteStats.openAlerts} open`}
              tint={colors.tileButter}
            />
          </View>
        </View>

        <StatStrip
          stats={[
            { icon: 'vehicle', value: String(demoSiteStats.vehiclesOnSite), label: 'Cars in' },
            { icon: 'occupants', value: String(demoSiteStats.peopleOnSite), label: 'People in' },
            { icon: 'duration', value: demoSiteStats.averageStay, label: 'Avg stay' },
          ]}
        />

        <LastScanCard {...demoLastScan} />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + space.sm }]}>
        <Pressable accessibilityRole="button" style={styles.manualEntry}>
          <Icon name="manual-entry" size={20} color={colors.inkMuted} />
          <Text variant="body" color={colors.inkSubtle}>
            Type a plate or ID number
          </Text>
        </Pressable>
        <View style={styles.dockRow}>
          <View style={styles.nav}>
            <View style={[styles.navItem, styles.navItemActive]}>
              <Icon name="overview-filled" size={22} />
            </View>
            <View style={styles.navItem}>
              <Icon name="guard" size={22} color={colors.inkInverse} />
            </View>
          </View>
          <IconButton icon="scan" label="Scan" tone="dark" size={64} elevated onPress={() => router.push('/entry')} />
        </View>
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
    gap: space.xl,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  syncPill: {
    height: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.clearSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greeting: {
    gap: space.xs,
  },
  tiles: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  column: {
    flex: 1,
    gap: space.sm,
  },
  columnOffset: {
    marginTop: space.xl,
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    gap: space.sm,
    backgroundColor: colors.background,
    boxShadow: shadow.dockFade,
  },
  manualEntry: {
    height: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nav: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  navItem: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    backgroundColor: colors.surface,
  },
});
