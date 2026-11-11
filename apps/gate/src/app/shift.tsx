import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { appendEvent } from '@/db/outbox';
import { gatePolicy, releaseHandheld, type GatePolicy } from '@/device/gate-policy';
import { SupervisorOverride } from '@/gate/supervisor-override';
import { newEventId } from '@/lib/ids';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { Text } from '@/components/text';
import { useLocalDatabase } from '@/db/database-context';
import { ResultBanner } from '@/components/result-banner';
import { appVersionLine } from '@/lib/app-updates';
import { periodHours, postLabel, siteConfig } from '@/site/site-config';
import { useShift } from '@/shift/shift-context';
import { useSync, type SyncStatus } from '@/sync/sync-context';

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function syncSummary(status: SyncStatus, pending: number): string {
  const waiting = `${pending} waiting to upload`;
  switch (status.state) {
    case 'local-only':
      return 'Not set up in this build. Records stay on this device.';
    case 'not-paired':
      return `Not paired · ${waiting}`;
    case 'revoked':
      return `Removed from the site · ${waiting}`;
    case 'syncing':
      return 'Syncing now';
    case 'synced':
      return `Synced at ${clockTime(status.lastSyncedAt)} · ${waiting}`;
    case 'offline':
      return `${status.lastSyncedAt ? `Offline since ${clockTime(status.lastSyncedAt)}` : 'Not synced yet'} · ${waiting}`;
  }
}

export default function ShiftScreen() {
  const insets = useSafeAreaInsets();
  const { state, lock, signOut } = useSession();
  const { db, encrypted } = useLocalDatabase();
  const sync = useSync();
  const { shift, end } = useShift();
  const [ending, setEnding] = useState(false);
  const [endProblem, setEndProblem] = useState<string | null>(null);
  const [policy, setPolicy] = useState<GatePolicy>(gatePolicy);
  const [releasing, setReleasing] = useState(false);
  const [releaseResult, setReleaseResult] = useState<{ tone: 'clear' | 'warning'; title: string; message: string } | null>(null);
  if (state.status === 'signed-out' || !shift) return null;
  const { user } = state;

  // Recorded either way, with the supervisor, so the control room knows a handheld left DigiGate's control.
  const release = async (supervisor: GateUser) => {
    setReleasing(false);
    const result = releaseHandheld();
    const at = Date.now();
    try {
      await appendEvent(db, {
        id: newEventId(at),
        type: 'handheld_released',
        occurredAt: at,
        gateUserId: supervisor.id,
        payload: { released: result.released, problems: result.released ? [] : result.problems },
      });
      sync.eventRecorded();
    } catch (cause) {
      setReleaseResult({ tone: 'warning', title: 'Not recorded', message: `The release wasn't recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Tell the control room.` });
      return;
    }
    setPolicy(gatePolicy());
    setReleaseResult(
      result.released
        ? { tone: 'clear', title: 'Handheld released', message: 'Its other apps, hotspot and settings are back, and DigiGate is an ordinary app on it now.' }
        : { tone: 'warning', title: 'Not released', message: `Android refused part of it (${result.problems.join(', ')}). It's still locked to DigiGate.` },
    );
  };

  if (releasing) {
    return (
      <SupervisorOverride
        fixedReason="Releasing this handheld from DigiGate"
        chip="Supervisor confirms"
        notSupervisorMessage="Only a supervisor can release a handheld. Call one."
        onConfirmed={(supervisor) => void release(supervisor)}
        onCancel={() => setReleasing(false)}
      />
    );
  }

  const endShift = async () => {
    setEnding(true);
    setEndProblem(null);
    try {
      await end();
    } catch (cause) {
      setEndProblem(`Your shift wasn't ended (${cause instanceof Error ? cause.message : 'unknown error'}). Try the switch again.`);
      setEnding(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
      </View>

      <View style={styles.heading}>
        <Text variant="overline" color={colors.inkMuted}>
          Your shift
        </Text>
        <Text variant="display">{`${user.firstName}\n${user.lastName}`}</Text>
      </View>

      {endProblem ? <ResultBanner tone="warning" title="Still on duty" message={endProblem} /> : null}
      {releaseResult ? <ResultBanner tone={releaseResult.tone} title={releaseResult.title} message={releaseResult.message} /> : null}

      <Card style={styles.onDuty}>
        <View style={styles.onDutyCopy}>
          <Text variant="bodyStrong">On duty</Text>
          <Text variant="label" color={colors.inkMuted}>
            Switch off when your shift ends. You'll be signed out.
          </Text>
        </View>
        <Switch
          value={!ending}
          onValueChange={endShift}
          disabled={ending}
          trackColor={{ false: colors.border, true: colors.clear }}
          thumbColor={colors.surface}
          accessibilityLabel="On duty"
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.person}>
          <View style={styles.avatar}>
            <Text variant="heading" color={colors.brand}>
              {`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`}
            </Text>
          </View>
          <Text variant="overline" color={colors.brand}>
            {user.role === 'supervisor' ? 'Supervisor' : 'Guard'}
          </Text>
        </View>
        <Field label="Employee number" value={user.employeeNumber} />
        <Field label="On duty since" value={clockTime(shift.startedAt)} />
        <Field label="Access point" value={`${postLabel(shift.post)} · ${periodHours(shift.period)}`} />
        <Field label="Screen locks" value={`After ${siteConfig.idleLockMinutes} minutes without a touch or a scan, or once the screen has been off for 5 seconds`} />
        <Field label="Sync" value={syncSummary(sync.status, sync.pendingEvents)} />
        <Field label="Device storage" value={encrypted ? 'Encrypted' : 'Not encrypted (Expo Go, demo data only)'} />
        <Field label="App" value={appVersionLine()} />
        <Field label="Handheld" value={handheldSummary(policy)} />
      </Card>

      <View style={styles.actions}>
        <PillButton label="Switch guard" icon="guard" onPress={signOut} />
        <PillButton label="Lock screen" icon="lock" variant="secondary" onPress={lock} />
        <PillButton label="Set this access point's location" icon="on-site" variant="secondary" onPress={() => router.push('/set-location')} />
        {sync.status.state !== 'local-only' ? (
          <PillButton label="Sync now" icon="syncing" variant="secondary" onPress={() => void sync.syncNow()} />
        ) : null}
        {policy.kind === 'managed' ? (
          <PillButton label="Release this handheld" icon="override" variant="secondary" onPress={() => setReleasing(true)} />
        ) : null}
      </View>
    </ScrollView>
  );
}

function handheldSummary(policy: GatePolicy): string {
  if (policy.kind === 'not-managed') return 'Not locked to DigiGate';
  const count = policy.problems.length;
  return count === 0 ? 'Locked to DigiGate: no hotspot, other apps hidden' : `Locked to DigiGate, but ${count} ${count === 1 ? 'setting' : 'settings'} refused`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text variant="overline" color={colors.inkSubtle}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
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
  onDuty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  onDutyCopy: {
    flex: 1,
    gap: 2,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    gap: space.xs,
  },
  card: {
    gap: space.md,
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
  field: {
    gap: 2,
  },
  actions: {
    marginTop: 'auto',
    gap: space.xs,
  },
});
