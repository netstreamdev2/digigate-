import { colors, space } from '@digigate/design';
import type { LocationSubscription } from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GateUser } from '@/auth/users';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { useLocalDatabase } from '@/db/database-context';
import { appendEvent } from '@/db/outbox';
import { setLocalPostFence } from '@/db/site-posts';
import { SupervisorOverride } from '@/gate/supervisor-override';
import { newEventId } from '@/lib/ids';
import { locationLibrary } from '@/lib/native';
import { startPostFence } from '@/shift/post-fence';
import { useShift } from '@/shift/shift-context';
import { fenceOf, postLabel } from '@/site/site-config';
import { useSync } from '@/sync/sync-context';

// A position is only saved once the GPS is this sure of it. Under a roof or between buildings it rarely gets there, so
// the screen says to move into the open.
const GOOD_ACCURACY_M = 15;
// The last few good readings are averaged, which settles the wander a single reading has.
const READINGS_AVERAGED = 5;
const READING_EVERY_MS = 1000;
const RADIUS_CHOICES = [30, 50, 100, 200] as const;
const DEFAULT_RADIUS_M = 50;

type Reading = { latitude: number; longitude: number; accuracyM: number };
type Position = { latitude: number; longitude: number; accuracyM: number; good: number };

function averaged(readings: readonly Reading[], latest: Reading): Position {
  const good = readings.filter((reading) => reading.accuracyM <= GOOD_ACCURACY_M);
  if (good.length === 0) return { ...latest, good: 0 };
  const sum = good.reduce((total, reading) => ({ latitude: total.latitude + reading.latitude, longitude: total.longitude + reading.longitude }), { latitude: 0, longitude: 0 });
  return { latitude: sum.latitude / good.length, longitude: sum.longitude / good.length, accuracyM: latest.accuracyM, good: good.length };
}

/**
 * Sets where the guard's access point is from the device's own GPS: stand at the gate, wait for a good fix, choose how
 * far the geofence reaches, and a supervisor confirms with their number and PIN. It's recorded like any gate action, so
 * it works offline and reaches the dashboard at the next sync. The geofence starts at once.
 */
export default function SetLocationScreen() {
  const insets = useSafeAreaInsets();
  const { db } = useLocalDatabase();
  const { shift } = useShift();
  const { eventRecorded } = useSync();
  const current = shift ? fenceOf(shift.post) : null;
  const [position, setPosition] = useState<Position | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [radiusM, setRadiusM] = useState<number>(current?.radiusM ?? DEFAULT_RADIUS_M);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const location = locationLibrary;
    if (!location) {
      setProblem("This build can't use the device's location.");
      return;
    }
    let subscription: LocationSubscription | null = null;
    let stopped = false;
    const readings: Reading[] = [];
    location
      .requestForegroundPermissionsAsync()
      .then(async ({ granted }) => {
        if (!granted) {
          setProblem("DigiGate isn't allowed to use this device's location. Allow it in the Android settings, then come back.");
          return;
        }
        const watching = await location.watchPositionAsync({ accuracy: location.Accuracy.Highest, timeInterval: READING_EVERY_MS, distanceInterval: 0 }, ({ coords }) => {
          const reading = { latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy ?? Number.POSITIVE_INFINITY };
          readings.push(reading);
          if (readings.length > READINGS_AVERAGED) readings.shift();
          setPosition(averaged(readings, reading));
        });
        if (stopped) watching.remove();
        else subscription = watching;
      })
      .catch((cause: unknown) => setProblem(`The GPS didn't start (${cause instanceof Error ? cause.message : 'unknown error'}). Check location is on.`));
    return () => {
      stopped = true;
      subscription?.remove();
    };
  }, []);

  if (!shift) {
    return (
      <View style={[styles.screen, styles.content, { paddingTop: insets.top }]}>
        <ResultBanner tone="warning" title="Not on duty" message="Start a shift at the access point first, then set its location from there." />
        <PillButton label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const label = postLabel(shift.post);
  const ready = position !== null && position.good > 0;

  const save = async (supervisor: GateUser) => {
    setConfirming(false);
    if (!position) return;
    const at = Date.now();
    const fence = { latitude: position.latitude, longitude: position.longitude, radiusM };
    try {
      await appendEvent(db, {
        id: newEventId(at),
        type: 'post_location_set',
        occurredAt: at,
        gateUserId: supervisor.id,
        payload: { post: shift.post, shift_id: shift.id, latitude: fence.latitude, longitude: fence.longitude, radius_m: radiusM, accuracy_m: Math.round(position.accuracyM) },
      });
      eventRecorded();
      if (await setLocalPostFence(db, shift.post, fence)) {
        await startPostFence({ db, shift, fence, postLabel: label, recorded: eventRecorded });
      }
      setSaved(true);
    } catch (cause) {
      setProblem(`The location wasn't saved (${cause instanceof Error ? cause.message : 'unknown error'}). Try again.`);
    }
  };

  if (confirming) {
    return (
      <SupervisorOverride
        fixedReason={`Setting where ${label} is`}
        chip="Supervisor confirms"
        notSupervisorMessage="Only a supervisor can set where an access point is. Call one to the gate."
        onConfirmed={(supervisor) => void save(supervisor)}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  const status = problem
    ? null
    : position === null
      ? 'Finding your position…'
      : ready
        ? `Ready. Accurate to about ${Math.round(position.accuracyM)} m.`
        : `Accurate to about ${Math.round(position.accuracyM)} m so far. Move into the open, away from roofs and walls.`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Back" tone="dark" onPress={() => router.back()} />
      </View>

      <View style={styles.copy}>
        <Text variant="overline" color={colors.inkMuted}>
          {label}
        </Text>
        <Text variant="display">Set where this access point is</Text>
        <Text variant="body" color={colors.inkMuted}>
          Stand where the guard stands at the gate and wait for a good GPS fix. A supervisor confirms it with their PIN.
        </Text>
      </View>

      {saved ? (
        <>
          <ResultBanner tone="clear" title="Location set" message={`Leaving ${label} is now checked. The dashboard gets it at the next sync.`} />
          <PillButton label="Done" onPress={() => router.back()} />
        </>
      ) : (
        <>
          {problem ? <ResultBanner tone="warning" title="No location" message={problem} /> : null}
          {status ? (
            <Card style={styles.status}>
              <Text variant="overline" color={ready ? colors.clear : colors.inkMuted}>
                {ready ? 'GPS ready' : 'Waiting for GPS'}
              </Text>
              <Text variant="bodyStrong">{status}</Text>
            </Card>
          ) : null}

          <View style={styles.section}>
            <Text variant="overline" color={colors.inkMuted}>
              Geofence
            </Text>
            <Text variant="label" color={colors.inkMuted}>
              A guard further than this from the gate is warned, and the control room is told.
            </Text>
            <View style={styles.choices} accessibilityRole="radiogroup">
              {RADIUS_CHOICES.map((choice) => (
                <Chip key={choice} label={`${choice} m`} tone={choice === radiusM ? 'selected' : 'neutral'} onPress={() => setRadiusM(choice)} />
              ))}
            </View>
          </View>

          <PillButton label="Set location here" icon="check" disabled={!ready} onPress={() => setConfirming(true)} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  copy: {
    gap: space.xs,
  },
  status: {
    gap: space.xxs,
  },
  section: {
    gap: space.sm,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
});
