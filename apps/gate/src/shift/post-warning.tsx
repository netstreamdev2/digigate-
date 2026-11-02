import { colors, space } from '@digigate/design';
import { router, usePathname } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { useLocalDatabase } from '@/db/database-context';
import type { Shift } from '@/db/shifts';
import { fenceOf, postLabel } from '@/site/site-config';
import { useSync } from '@/sync/sync-context';

import { fenceStatus, startPostFence, stopPostFence, subscribeToFence, type FenceStatus } from './post-fence';

const FLASH_MS = 450;
const EDGE_WIDTH = 14;

type Props = {
  /** The shift of the guard signed in here, or null when nobody is on duty. */
  shift: Shift | null;
  locked: boolean;
};

export function useFenceStatus(): FenceStatus {
  return useSyncExternalStore(subscribeToFence, fenceStatus);
}

function FlashingEdge() {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const flash = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: FLASH_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: FLASH_MS, useNativeDriver: true }),
      ]),
    );
    flash.start();
    return () => flash.stop();
  }, [opacity]);

  return <Animated.View pointerEvents="none" style={[styles.edge, { opacity }]} />;
}

/**
 * Keeps the watch on the post going for as long as a guard is on duty, and flashes the screen's edge when they've left it.
 * It sits above everything, the lock screen too, because that's when a guard has wandered off. While locked it only
 * warns: saying why you've left takes your PIN first.
 */
export function PostWarning({ shift, locked }: Props) {
  const { db } = useLocalDatabase();
  const { eventRecorded } = useSync();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { outside } = useFenceStatus();
  const [attempt, setAttempt] = useState(0);

  // Read on every render, so a location set in the dashboard takes effect at the next sync, mid-shift.
  const fence = shift ? fenceOf(shift.post) : null;
  const latitude = fence?.latitude;
  const longitude = fence?.longitude;
  const radiusM = fence?.radiusM;

  useEffect(() => {
    if (!shift || latitude === undefined || longitude === undefined || radiusM === undefined) {
      void stopPostFence();
      return;
    }
    void startPostFence({ db, shift, fence: { latitude, longitude, radiusM }, postLabel: postLabel(shift.post), recorded: eventRecorded });
  }, [attempt, db, eventRecorded, latitude, longitude, radiusM, shift]);

  // The guard may have turned location on, or allowed it, in the Android settings.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && fenceStatus().problem) setAttempt((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  if (!outside) return null;
  return (
    <>
      <FlashingEdge />
      {pathname === '/stepping-away' ? null : (
        <View style={[styles.banner, { top: insets.top + space.sm }]}>
          <ResultBanner tone="blocked" title="You've left your post" message="Go back, or say you're stepping away." />
          {locked ? null : <PillButton label="Stepping away" icon="exit" onPress={() => router.push('/stepping-away')} />}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: EDGE_WIDTH,
    borderColor: colors.blocked,
  },
  banner: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    gap: space.xs,
  },
});
