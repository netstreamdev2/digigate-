import { colors, radius, space } from '@digigate/design';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PIN_LENGTH } from '@/auth/pin';
import { useSession, type SignInResult } from '@/auth/session';
import { Chip } from '@/components/chip';
import { Keypad } from '@/components/keypad';
import { Logo } from '@/components/logo';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { demoPost } from '@/demo/gate-demo';

const EMPLOYEE_NUMBER_MIN_LENGTH = 3;
const EMPLOYEE_NUMBER_MAX_LENGTH = 8;

type Problem = {
  tone: 'warning' | 'blocked';
  title: string;
  message: string;
};

function problemFor(result: Exclude<SignInResult, { ok: true }>): Problem {
  if (result.reason === 'locked-out') {
    const time = new Date(result.retryAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    return { tone: 'blocked', title: 'Locked out', message: `Too many wrong PINs. Try again after ${time}, or ask a supervisor.` };
  }
  const tries = `${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left`;
  return { tone: 'warning', title: 'Try again', message: `That employee number and PIN don't match. ${tries}.` };
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { state, signIn, unlock, signOut } = useSession();
  const lockedUser = state.status === 'locked' ? state.user : null;
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [enteringPin, setEnteringPin] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const pinStep = lockedUser !== null || enteringPin;

  const submit = async (fullPin: string) => {
    setChecking(true);
    try {
      const result = lockedUser ? await unlock(fullPin) : await signIn(employeeNumber, fullPin);
      if (!result.ok) setProblem(problemFor(result));
    } catch {
      setProblem({ tone: 'warning', title: 'Try again', message: "Couldn't check the PIN. Enter it again." });
    } finally {
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
  const subtitle = lockedUser
    ? 'The screen locked while it was idle.'
    : pinStep
      ? `Employee ${employeeNumber}`
      : 'Type your employee number';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <Logo height={26} />
        <Chip label={`${demoPost.gate} · ${demoPost.lane}`} />
      </View>

      <View style={styles.heading}>
        <Text variant="display">{title}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.entry}>
        {pinStep ? (
          <PinDots filled={pin.length} />
        ) : (
          <Text variant="display" style={styles.employeeNumber}>
            {employeeNumber}
          </Text>
        )}
        <Text variant="label" color={colors.inkMuted}>
          {checking ? 'Checking…' : ' '}
        </Text>
      </View>

      {problem ? <ResultBanner tone={problem.tone} title={problem.title} message={problem.message} /> : null}

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

function PinDots({ filled }: { filled: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`${filled} of ${PIN_LENGTH} digits entered`}>
      {Array.from({ length: PIN_LENGTH }, (_, index) => (
        <View key={index} style={[styles.dot, index < filled && styles.dotFilled]} />
      ))}
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
  dots: {
    flexDirection: 'row',
    gap: space.md,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.inkSubtle,
  },
  dotFilled: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  controls: {
    gap: space.md,
  },
});
