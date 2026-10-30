import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { Text } from '@/components/text';
import { useLocalDatabase } from '@/db/database-context';
import { ResultBanner } from '@/components/result-banner';
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
  const { encrypted } = useLocalDatabase();
  const sync = useSync();
  const { shift, end } = useShift();
  const [ending, setEnding] = useState(false);
  const [endProblem, setEndProblem] = useState<string | null>(null);
  if (state.status === 'signed-out' || !shift) return null;
  const { user } = state;

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
        <Field label="Post" value={`${postLabel(shift.post)} · ${periodHours(shift.period)}`} />
        <Field label="Screen locks" value={`After ${siteConfig.idleLockMinutes} minutes without a touch or a scan, or when the screen goes off`} />
        <Field label="Sync" value={syncSummary(sync.status, sync.pendingEvents)} />
        <Field label="Device storage" value={encrypted ? 'Encrypted' : 'Not encrypted (Expo Go, demo data only)'} />
      </Card>

      <View style={styles.actions}>
        <PillButton label="Switch guard" icon="guard" onPress={signOut} />
        <PillButton label="Lock screen" icon="lock" variant="secondary" onPress={lock} />
        {sync.status.state !== 'local-only' ? (
          <PillButton label="Sync now" icon="syncing" variant="secondary" onPress={() => void sync.syncNow()} />
        ) : null}
      </View>
    </ScrollView>
  );
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
