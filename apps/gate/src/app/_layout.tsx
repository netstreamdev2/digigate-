import { colors, fontFamily, space } from '@digigate/design';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { InterTight_600SemiBold, InterTight_700Bold } from '@expo-google-fonts/inter-tight';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionProvider, useSession, type SessionStore } from '@/auth/session';
import { ResultBanner } from '@/components/result-banner';
import { openLocalDatabase, type LocalDatabase } from '@/db/database';
import { LocalDatabaseProvider, useLocalDatabase } from '@/db/database-context';
import { countGateUsers, findGateUser, replaceGateUsers } from '@/db/gate-users';
import { hasValueWithPrefix } from '@/db/kv';
import { appendEvent } from '@/db/outbox';
import { clearFailure, getFailure, setFailure } from '@/db/sign-in-failures';
import { demoPost } from '@/demo/gate-demo';
import { seedUsers } from '@/demo/seed-users';
import { newEventId } from '@/lib/ids';
import { AUTH_KEY_PREFIX } from '@/sync/supabase';
import { SyncProvider, useSync } from '@/sync/sync-context';

SplashScreen.preventAutoHideAsync();

async function prepareDatabase(): Promise<LocalDatabase> {
  const local = await openLocalDatabase();
  // Development builds start with the demo guards until the device is paired and syncs real ones.
  if (__DEV__ && (await countGateUsers(local.db)) === 0 && !(await hasValueWithPrefix(local.db, AUTH_KEY_PREFIX))) {
    await replaceGateUsers(local.db, seedUsers);
  }
  return local;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fontFamily.display]: InterTight_700Bold,
    [fontFamily.displayMedium]: InterTight_600SemiBold,
    [fontFamily.text]: Inter_400Regular,
    [fontFamily.textMedium]: Inter_500Medium,
    [fontFamily.textSemibold]: Inter_600SemiBold,
  });
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    prepareDatabase().then(
      (local) => {
        if (!cancelled) setDatabase(local);
      },
      (cause: unknown) => {
        if (!cancelled) setDatabaseError(cause instanceof Error ? cause.message : 'Unknown error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = Boolean(fontsLoaded || fontError) && Boolean(database || databaseError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (!database) return <StartupProblem detail={databaseError ?? 'Unknown error'} />;

  return (
    <LocalDatabaseProvider database={database}>
      <SyncProvider>
        <AppSession>
          <StatusBar style="dark" />
          <GuardedStack />
        </AppSession>
      </SyncProvider>
    </LocalDatabaseProvider>
  );
}

function AppSession({ children }: { children: ReactNode }) {
  const { db } = useLocalDatabase();
  const { eventRecorded } = useSync();

  const store = useMemo<SessionStore>(
    () => ({
      findUser: (employeeNumber) => findGateUser(db, employeeNumber),
      getFailure: (employeeNumber) => getFailure(db, employeeNumber),
      setFailure: (employeeNumber, record) => setFailure(db, employeeNumber, record),
      clearFailure: (employeeNumber) => clearFailure(db, employeeNumber),
      record: async (type, gateUserId, payload = {}) => {
        await appendEvent(db, { id: newEventId(), type, occurredAt: Date.now(), gateUserId, payload });
        eventRecorded();
      },
    }),
    [db, eventRecorded],
  );

  return (
    <SessionProvider store={store} idleLockMinutes={demoPost.idleLockMinutes}>
      {children}
    </SessionProvider>
  );
}

function GuardedStack() {
  const { state, recordActivity } = useSession();
  const signedIn = state.status === 'active';

  return (
    <View style={styles.root} onTouchStart={recordActivity}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
          <Stack.Screen name="entry" />
          <Stack.Screen name="exit" />
          <Stack.Screen name="shift" />
          <Stack.Screen name="scan-test" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="pair" />
      </Stack>
    </View>
  );
}

function StartupProblem({ detail }: { detail: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.problem, { paddingTop: insets.top + space.xl }]}>
      <ResultBanner
        tone="blocked"
        title="DigiGate couldn't start"
        message={`The device's storage didn't open (${detail}). Restart the app. If it happens again, call your supervisor.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  problem: {
    flex: 1,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
  },
});
