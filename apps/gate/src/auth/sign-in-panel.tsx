import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PIN_LENGTH } from '@/auth/pin';
import { pinProblem, type PinProblem } from '@/auth/pin-problem';
import { useSession, type LockReason } from '@/auth/session';
import { Chip } from '@/components/chip';
import { Keypad } from '@/components/keypad';
import { Logo } from '@/components/logo';
import { PillButton } from '@/components/pill-button';
import { PinDots } from '@/components/pin-dots';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { useLocalDatabase } from '@/db/database-context';
import { onDutyElsewhereIds, takeMovedNotice, type MovedNotice } from '@/db/duty-elsewhere';
import { countGateUsers, signInTiles, type NumberTile } from '@/db/gate-users';
import { siteConfig, siteName } from '@/site/site-config';

import { NumberTiles } from './number-tiles';
import { useSync, type SyncStatus } from '@/sync/sync-context';

const EMPLOYEE_NUMBER_MIN_LENGTH = 3;
// More numbers than this on one handheld are typed: tiles are for a short list.
const MOST_TILES = 30;
const HOUR_MS = 60 * 60_000;
const EMPLOYEE_NUMBER_MAX_LENGTH = 8;

function noGuardsMessage(status: SyncStatus): string {
  if (status.state === 'revoked') return 'This device was removed from the site. Ask an admin for a new pairing code.';
  if (status.state === 'not-paired') return 'Pair it with the dashboard so the guard list can sync.';
  if (status.state === 'local-only') return 'This build has no Supabase settings and no demo guards.';
  return 'Waiting for the guard list to sync. Check the connection.';
}

const LOCK_MESSAGES: Record<LockReason, string> = {
  idle: 'The screen locked while it was idle.',
  'screen-off': 'The screen locked when it went off.',
  manual: 'The screen was locked.',
};

/** Employee number and PIN at sign-in, or just the PIN when the screen is locked. */
export function SignInPanel() {
  const insets = useSafeAreaInsets();
  const { state, signIn, unlock, signOut, storageProblem } = useSession();
  const { db } = useLocalDatabase();
  const sync = useSync();
  const [guardCount, setGuardCount] = useState<number | null>(null);
  const lockedUser = state.status === 'locked' ? state.user : null;

  // Recount whenever sync reports in, so a newly synced guard list unlocks the screen without a restart.
  useEffect(() => {
    countGateUsers(db).then(setGuardCount, () => setGuardCount(null));
  }, [db, sync.status]);
  // A guard signed out because a supervisor moved their shift to another handheld is told why, once.
  const [moved, setMoved] = useState<MovedNotice | null>(null);
  useEffect(() => {
    takeMovedNotice(db).then(
      (notice) => {
        if (notice) setMoved(notice);
      },
      () => {
        // Nothing to show: the guard simply signs in again.
      },
    );
  }, [db, sync.status]);
  // The employee numbers as tiles to tap, and which are on duty on another handheld. Null tiles: too many to show.
  const [tiles, setTiles] = useState<NumberTile[] | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    signInTiles(db, MOST_TILES).then(setTiles, () => setTiles(null));
    onDutyElsewhereIds(db, Date.now(), siteConfig.maxShiftHours * HOUR_MS).then(setBusy, () => setBusy(new Set()));
  }, [db, sync.status]);
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [enteringPin, setEnteringPin] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<PinProblem | null>(null);
  // The guard asked what to do about a PIN they've forgotten.
  const [forgot, setForgot] = useState(false);
  // Development builds show how long the PIN check took, to tune hash iterations on real devices.
  const [lastCheckMs, setLastCheckMs] = useState<number | null>(null);
  const pinStep = lockedUser !== null || enteringPin;
  // With tiles there is no typing (14 November): guards who typed couldn't find their way back. A handheld with too
  // many numbers for tiles still has the keypad.
  const showTiles = !pinStep && tiles !== null && tiles.length > 0;

  const pick = (number: string) => {
    setProblem(null);
    setMoved(null);
    setForgot(false);
    setEmployeeNumber(number);
    setEnteringPin(true);
  };

  const submit = async (fullPin: string) => {
    setChecking(true);
    const started = Date.now();
    try {
      const result = lockedUser ? await unlock(fullPin) : await signIn(employeeNumber, fullPin);
      if (!result.ok) setProblem(pinProblem(result));
    } catch {
      setProblem({ tone: 'warning', title: 'Try again', message: "Couldn't check the PIN. Enter it again." });
    } finally {
      if (__DEV__) setLastCheckMs(Date.now() - started);
      setChecking(false);
      setPin('');
    }
  };

  const onDigit = (digit: string) => {
    setProblem(null);
    setMoved(null);
    setForgot(false);
    if (!pinStep) {
      if (employeeNumber.length < EMPLOYEE_NUMBER_MAX_LENGTH) setEmployeeNumber(employeeNumber + digit);
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const onDelete = () => {
    if (pinStep) setPin(pin.slice(0, -1));
    else setEmployeeNumber(employeeNumber.slice(0, -1));
  };

  const startOver = () => {
    setPin('');
    setEnteringPin(false);
    setEmployeeNumber('');
    setProblem(null);
    setForgot(false);
    if (lockedUser) signOut();
  };

  const title = lockedUser ? `Welcome back,\n${lockedUser.firstName}` : pinStep ? 'Enter your PIN' : "Who's on shift?";
  const subtitle =
    state.status === 'locked'
      ? LOCK_MESSAGES[state.reason]
      : pinStep
      ? `Employee ${employeeNumber}`
      : showTiles
      ? 'Tap your employee number'
      : 'Type your employee number';

  const topBar = (
    <View style={styles.topBar}>
      <Logo height={26} />
      <Chip label={siteName()} />
    </View>
  );

  // A handheld with nobody on its guard list can't sign anyone in: it gets its own screen, not a keypad to nowhere.
  if (guardCount === 0 && !lockedUser) {
    const unpaired = sync.status.state === 'not-paired' || sync.status.state === 'revoked';
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
        {topBar}
        <View style={styles.setup}>
          <Text variant="display">{unpaired ? 'Set up this handheld' : 'Almost ready'}</Text>
          <Text variant="body" color={colors.inkMuted}>
            {noGuardsMessage(sync.status)}
          </Text>
        </View>
        {unpaired ? (
          <PillButton label="Pair this device" icon="scan" onPress={() => router.push('/pair')} />
        ) : (
          <PillButton label="Sync now" icon="syncing" variant="secondary" onPress={() => void sync.syncNow()} />
        )}
      </View>
    );
  }

  // At most one notice, compact and in the heading's place, so the keypad and the button under it always fit.
  const notice = problem
    ? { tone: problem.tone, title: problem.title, message: problem.message }
    : storageProblem
      ? { tone: 'warning' as const, title: 'Record not saved', message: "A lock or sign-out couldn't be saved on this device. Tell your supervisor." }
      : moved
        ? {
            tone: 'warning' as const,
            title: 'Shift moved',
            message: `A supervisor moved ${moved.firstName}'s shift to another handheld at ${new Date(moved.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}, so they were signed out here.`,
          }
        : forgot
          ? {
              tone: 'warning' as const,
              title: 'Forgot your PIN?',
              message: 'Ask your supervisor or the control room to reset it in the DigiGate dashboard. The new PIN works here within a minute.',
            }
          : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      {topBar}

      {notice ? <ResultBanner compact tone={notice.tone} title={notice.title} message={notice.message} /> : (
        <View style={styles.heading}>
          <Text variant="display">{title}</Text>
          <Text variant="label" color={colors.inkMuted}>
            {subtitle}
          </Text>
        </View>
      )}

      {showTiles && tiles ? (
        <View style={styles.tiles}>
          <NumberTiles tiles={tiles} busy={busy} onPick={pick} />
        </View>
      ) : (
        <>
          <View style={styles.entry}>
            {pinStep ? (
              <PinDots filled={pin.length} />
            ) : (
              <Text variant="display" style={styles.employeeNumber}>
                {employeeNumber}
              </Text>
            )}
            {pinStep && !checking && !forgot ? (
              // In the line under the dots, which is empty at this step, so the keypad below never moves.
              <Pressable onPress={() => setForgot(true)} accessibilityRole="button" hitSlop={space.sm}>
                <Text variant="label" color={colors.brand}>
                  Forgot your PIN?
                </Text>
              </Pressable>
            ) : (
              <Text variant="label" color={colors.inkMuted}>
                {checking ? 'Checking…' : __DEV__ && lastCheckMs !== null ? `Last PIN check took ${lastCheckMs} ms` : ' '}
              </Text>
            )}
          </View>

          <View style={styles.controls}>
            <Keypad onDigit={onDigit} onDelete={onDelete} disabled={checking} />
            {pinStep ? (
              <PillButton label={lockedUser ? 'Switch guard' : 'Change employee number'} variant="secondary" onPress={startOver} />
            ) : (
              <PillButton label="Continue" disabled={employeeNumber.length < EMPLOYEE_NUMBER_MIN_LENGTH} onPress={() => setEnteringPin(true)} />
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
    gap: space.lg,
  },
  tiles: {
    flex: 1,
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
  setup: {
    flex: 1,
    justifyContent: 'center',
    gap: space.sm,
  },
  entry: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  employeeNumber: {
    minHeight: 41,
    letterSpacing: 4,
  },
  controls: {
    gap: space.md,
  },
});
