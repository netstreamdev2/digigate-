import { carParkState, decodeDocument } from '@digigate/core';
import { colors, radius, shadow, space } from '@digigate/design';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/session';
import { ActionTile } from '@/components/action-tile';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { LastScanCard } from '@/components/last-scan-card';
import { ParkingTile } from '@/components/parking-tile';
import { Logo } from '@/components/logo';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { StatStrip } from '@/components/stat-strip';
import { SyncPill } from '@/components/sync-pill';
import { Text } from '@/components/text';
import type { LastScan } from '@/db/last-scan';
import { handOffScan } from '@/gate/scan-handoff';
import { useHomeFigures } from '@/gate/use-home-figures';
import type { ScanNotice } from '@/gate/use-vehicle-documents';
import { fromBase64 } from '@/lib/bytes';
import { formatDuration } from '@/lib/format';
import { periodHours, siteCarPark, type Lane } from '@/site/site-config';
import { PostStatus } from '@/shift/post-status';
import { usePost, useShift } from '@/shift/shift-context';

import { subscribeToScans } from '../../modules/scanner';

const DOCK_HEIGHT = 156;

type Destination = 'entry' | 'exit' | 'walk-in' | 'walk-out';

/** A card scanned from home: the guard says where they're going and the scan travels with them. */
type Pending = { bytes: Uint8Array; document: 'driver-licence' | 'licence-disc' | 'smart-id' | 'id-number' | 'invite' };

const PENDING_CAPTION: Record<Pending['document'], string> = {
  'driver-licence': "Driver's licence scanned",
  'licence-disc': 'Licence disc scanned',
  'smart-id': 'Smart ID card scanned',
  'id-number': 'ID number scanned',
  invite: 'Visitor invite scanned',
};

/** Which ways a document can go: an invite is for coming in, a disc only for a car, an ID only on foot. */
function waysFor(document: Pending['document']): { byCar: boolean; onFoot: boolean; leaving: boolean } {
  return {
    byCar: document === 'driver-licence' || document === 'licence-disc' || document === 'invite',
    onFoot: document !== 'licence-disc',
    leaving: document !== 'invite',
  };
}

/** Whether this post has a way to handle the document, so the chooser never opens with nothing to choose. */
function postHandles(document: Pending['document'], lanes: readonly Lane[]): boolean {
  const { byCar, onFoot } = waysFor(document);
  return (byCar && lanes.includes('vehicle')) || (onFoot && lanes.includes('pedestrian'));
}

const NO_FIGURE = '—';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/** How the check ended, when it wasn't simply clear. */
function resultOf(scan: LastScan): { label: string; tone: 'blocked' | 'neutral' } | null {
  if (scan.settled === 'turned-away') return { label: 'Turned away', tone: 'blocked' };
  if (scan.outcome === 'blocked') return scan.settled ? { label: 'Overridden', tone: 'neutral' } : { label: 'Blocked', tone: 'blocked' };
  if (scan.outcome === 'warning') return scan.settled ? { label: 'Let through', tone: 'neutral' } : { label: 'Warning', tone: 'neutral' };
  return null;
}

function scanFields(scan: LastScan): { label: string; value: string }[] {
  return [
    ...(scan.plate ? [{ label: 'Plate', value: scan.plate }] : []),
    ...(scan.idNumber ? [{ label: 'ID', value: scan.idNumber }] : []),
    ...(scan.vehicle ? [{ label: 'Vehicle', value: scan.vehicle }] : [{ label: 'Came', value: 'On foot' }]),
    ...(scan.people !== null ? [{ label: 'People', value: String(scan.people) }] : []),
  ];
}

function open(destination: Destination) {
  if (destination === 'walk-in') router.push({ pathname: '/walk-in', params: { direction: 'entry' } });
  else if (destination === 'walk-out') router.push({ pathname: '/walk-in', params: { direction: 'exit' } });
  else router.push(destination === 'entry' ? '/entry' : '/exit');
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const { shift } = useShift();
  const post = usePost();
  const { lanes } = post;
  const cars = lanes.includes('vehicle');
  const walkIns = lanes.includes('pedestrian');
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const figures = useHomeFigures(shift);
  const openAlerts = figures?.openAlerts ?? null;
  const lastScan = figures?.lastScan ?? null;

  // Only while home is in front: the screen it opens listens for itself. Leaving folds the walk-in tile back.
  useFocusEffect(
    useCallback(() => {
      const subscription = subscribeToScans((event) => {
        const bytes = fromBase64(event.bytes);
        const decoded = decodeDocument(bytes);
        setNotice(null);
        if (
          decoded.kind === 'smart-id' ||
          decoded.kind === 'id-number' ||
          decoded.kind === 'driver-licence' ||
          decoded.kind === 'licence-disc' ||
          decoded.kind === 'invite'
        ) {
          if (postHandles(decoded.kind, lanes)) setPending({ bytes, document: decoded.kind });
          else setNotice({ title: "Not at this post", message: `${post.label} doesn't handle this. Send them to the right gate.` });
        } else if (decoded.kind === 'unreadable') {
          setNotice({ title: "Couldn't read that", message: 'Scan it again, holding it flat and steady.' });
        } else {
          setNotice({ title: 'Not a document DigiGate knows', message: 'Scan a licence disc, a driver’s licence, a smart ID card or a visitor’s invite.' });
        }
      });
      return () => {
        subscription?.remove();
        setWalkInOpen(false);
      };
    }, [lanes, post.label]),
  );

  const ways = pending ? waysFor(pending.document) : null;

  const goWith = (destination: Destination) => {
    if (!pending) return;
    handOffScan(pending.bytes);
    setPending(null);
    open(destination);
  };

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
            <SyncPill />
            <IconButton
              icon="bell"
              label={openAlerts === null ? 'Open alerts not synced yet' : `${openAlerts} open alerts`}
              {...(openAlerts ? { badge: openAlerts } : {})}
            />
          </View>
        </View>

        <View style={styles.greeting}>
          <Text variant="display">{`Hi ${user?.firstName ?? 'there'},\nwho's at the gate?`}</Text>
          <Text variant="label" color={colors.inkMuted}>
            {shift ? `${post.label} · ${periodHours(shift.period)}` : post.label}
          </Text>
        </View>

        <PostStatus />

        {notice ? <ResultBanner tone="warning" title={notice.title} message={notice.message} /> : null}

        <View style={styles.tiles}>
          {cars ? (
            <>
              <View style={styles.tileSlot}>
                <ActionTile icon="entry" label="Entry" detail="Car coming in" tint={colors.tileSky} onPress={() => router.push('/entry')} />
              </View>
              <View style={styles.tileSlot}>
                <ActionTile
                  icon="exit"
                  label="Exit"
                  detail="Car leaving"
                  tint={colors.surfaceMuted}
                  outlined
                  onPress={() => router.push('/exit')}
                />
              </View>
            </>
          ) : null}
          {walkIns ? (
            <View style={styles.tileSlot}>
              {walkInOpen ? (
                <View style={styles.subTiles}>
                  <ActionTile compact icon="entry" label="Walking in" detail="On foot" tint={colors.tileMint} onPress={() => open('walk-in')} />
                  <ActionTile
                    compact
                    outlined
                    icon="exit"
                    label="Walking out"
                    detail="On foot"
                    tint={colors.surfaceMuted}
                    onPress={() => open('walk-out')}
                  />
                </View>
              ) : (
                <ActionTile icon="pedestrian" label="Walk-in" detail="On foot" tint={colors.tileMint} onPress={() => setWalkInOpen(true)} />
              )}
            </View>
          ) : null}
          {/* Open alerts are on the bell above; this space tells the guard whether there's anywhere to park. */}
          <View style={styles.tileSlot}>
            <ParkingTile state={figures ? carParkState(siteCarPark(), figures.vehicles) : { kind: 'unknown' }} />
          </View>
        </View>

        <StatStrip
          stats={[
            { icon: 'vehicle', value: figures ? String(figures.vehicles) : NO_FIGURE, label: 'Cars in' },
            { icon: 'occupants', value: figures ? String(figures.people) : NO_FIGURE, label: 'People in' },
            { icon: 'duration', value: figures?.averageStayMs ? formatDuration(figures.averageStayMs) : NO_FIGURE, label: 'Avg stay today' },
          ]}
        />

        {lastScan && figures ? (
          <LastScanCard
            name={lastScan.name}
            initials={initialsOf(lastScan.name)}
            visitType={lastScan.visitType}
            direction={lastScan.direction}
            time={ago(lastScan.at, figures.readAt)}
            fields={scanFields(lastScan)}
            result={resultOf(lastScan)}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type a plate or ID number"
          onPress={() => router.push('/manual')}
          style={({ pressed }) => [styles.manualEntry, pressed && styles.manualEntryPressed]}>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your shift"
              onPress={() => router.push('/shift')}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}>
              <Icon name="guard" size={22} color={colors.inkInverse} />
            </Pressable>
          </View>
          <IconButton icon="scan" label="Scan" tone="dark" size={64} elevated onPress={() => open(cars ? 'entry' : 'walk-in')} />
        </View>
      </View>

      {pending && ways ? (
        <View style={[styles.chooser, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.chooserTop}>
            <IconButton icon="close" label="Cancel" tone="dark" onPress={() => setPending(null)} />
          </View>
          <View style={styles.chooserCopy}>
            <Text variant="overline" color={colors.inkMuted}>
              {PENDING_CAPTION[pending.document]}
            </Text>
            <Text variant="display">Where are they going?</Text>
          </View>
          <View style={styles.chooserActions}>
            {cars && ways.byCar ? (
              <>
                <PillButton label="Car coming in" icon="entry" onPress={() => goWith('entry')} />
                {ways.leaving ? <PillButton label="Car leaving" icon="exit" variant="secondary" onPress={() => goWith('exit')} /> : null}
              </>
            ) : null}
            {walkIns && ways.onFoot ? (
              <>
                <PillButton label="Walking in" icon="pedestrian" variant={cars && ways.byCar ? 'secondary' : 'primary'} onPress={() => goWith('walk-in')} />
                {ways.leaving ? <PillButton label="Walking out" icon="exit" variant="secondary" onPress={() => goWith('walk-out')} /> : null}
              </>
            ) : null}
          </View>
        </View>
      ) : null}
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
  greeting: {
    gap: space.xs,
  },
  // Two to a row, however many lanes the post has.
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.sm,
  },
  tileSlot: {
    width: '48.5%',
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
  manualEntryPressed: {
    backgroundColor: colors.surfaceMuted,
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
  navItemPressed: {
    opacity: 0.7,
  },
  // Two compact tiles in the space of one, so nothing else on the screen moves.
  subTiles: {
    minHeight: 148,
    gap: space.xs,
  },
  chooser: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.lg,
    gap: space.xl,
    backgroundColor: colors.background,
  },
  chooserTop: {
    height: 56,
    justifyContent: 'center',
  },
  chooserCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: space.xs,
  },
  chooserActions: {
    gap: space.sm,
  },
});
