import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { countGateUsers } from '@/db/gate-users';
import { siteConfig } from '@/site/site-config';
import { useSync, type SyncStatus } from '@/sync/sync-context';

const EMPLOYEE_NUMBER_MIN_LENGTH = 3;
const EMPLOYEE_NUMBER_MAX_LENGTH = 8;

function noGuardsMessage(status: SyncStatus): string {
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
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [enteringPin, setEnteringPin] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<PinProblem | null>(null);
  // Development builds show how long the PIN check took, to tune hash iterations on real devices.
  const [lastCheckMs, setLastCheckMs] = useState<number | null>(null);
  const pinStep = lockedUser !== null || enteringPin;

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
    if (lockedUser) signOut();
  };

  const title = lockedUser ? `Welcome back,\n${lockedUser.firstName}` : pinStep ? 'Enter your PIN' : "Who's on shift?";
  const subtitle =
    state.status === 'locked'
      ? LOCK_MESSAGES[state.reason]
      : pinStep
      ? `Employee ${employeeNumber}`
      : 'Type your employee number';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <Logo height={26} />
        <Chip label={siteConfig.site} />
      </View>

      {/* The banner takes the heading's place, so the keypad and the button under it stay on screen. */}
      {problem ? null : (
        <View style={styles.heading}>
          <Text variant="display">{title}</Text>
          <Text variant="label" color={colors.inkMuted}>
            {subtitle}
          </Text>
        </View>
      )}

      <View style={styles.entry}>
        {pinStep ? (
          <PinDots filled={pin.length} />
        ) : (
          <Text variant="display" style={styles.employeeNumber}>
            {employeeNumber}
          </Text>
        )}
        <Text variant="label" color={colors.inkMuted}>
          {checking ? 'Checking…' : __DEV__ && lastCheckMs !== null ? `Last PIN check took ${lastCheckMs} ms` : ' '}
        </Text>
      </View>

      {problem ? <ResultBanner tone={problem.tone} title={problem.title} message={problem.message} /> : null}
      {storageProblem ? (
        <ResultBanner
          tone="warning"
          title="Record not saved"
          message="A lock or sign-out couldn't be saved on this device. Tell your supervisor."
        />
      ) : null}
      {guardCount === 0 && !lockedUser ? (
        <View style={styles.noGuards}>
          <ResultBanner tone="warning" title="No guards on this device yet" message={noGuardsMessage(sync.status)} />
          {sync.status.state === 'not-paired' ? (
            <PillButton label="Pair this device" variant="secondary" onPress={() => router.push('/pair')} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.controls}>
        <Keypad onDigit={onDigit} onDelete={onDelete} disabled={checking} />
        {pinStep ? (
          <PillButton
            label={lockedUser ? 'Switch guard' : 'Change employee number'}
            variant="secondary"
            onPress={startOver}
          />
        ) : (
          <PillButton
            label="Continue"
            disabled={employeeNumber.length < EMPLOYEE_NUMBER_MIN_LENGTH}
            onPress={() => setEnteringPin(true)}
          />
        )}
      </View>
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
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    gap: space.xs,
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
  noGuards: {
    gap: space.sm,
  },
});
