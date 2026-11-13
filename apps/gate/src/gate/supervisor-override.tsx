import { colors, space } from '@digigate/design';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PIN_LENGTH } from '@/auth/pin';
import { pinProblem, type PinProblem } from '@/auth/pin-problem';
import { useSession } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { Keypad } from '@/components/keypad';
import { PillButton } from '@/components/pill-button';
import { PinDots } from '@/components/pin-dots';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';

const EMPLOYEE_NUMBER_MAX_LENGTH = 8;

// Site config will supply these; the override is recorded with the reason exactly as chosen.
const REASONS = [
  'Documents checked by hand',
  'Driver known to the site',
  'Medical emergency',
  'Police or official vehicle',
  'Approved by security manager',
] as const;

type Props = {
  onConfirmed: (supervisor: GateUser, reason: string) => void;
  onCancel: () => void;
  /** Skips choosing a reason, for an action that has only one, such as setting an access point's location. */
  fixedReason?: string;
  /** The chip at the top, and what a guard who isn't a supervisor is told. */
  chip?: string;
  notSupervisorMessage?: string;
};

/** A supervisor approves something at the gate: a reason, then their own PIN. */
export function SupervisorOverride({
  onConfirmed,
  onCancel,
  fixedReason,
  chip = 'Supervisor override',
  notSupervisorMessage = 'Only a supervisor can override a block. Call one to the gate.',
}: Props) {
  const insets = useSafeAreaInsets();
  const { confirmSupervisor, confirmSupervisorByPin } = useSession();
  const [reason, setReason] = useState<string | null>(fixedReason ?? null);
  const [employeeNumber, setEmployeeNumber] = useState('');
  // The supervisor's PIN alone. Their employee number is asked for only if two supervisors share a PIN.
  const [askNumber, setAskNumber] = useState(false);
  const [numberGiven, setNumberGiven] = useState(false);
  const enteringPin = !askNumber || numberGiven;
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<PinProblem | null>(null);

  const submit = async (fullPin: string) => {
    if (!reason) return;
    setChecking(true);
    try {
      const pinOnly = !askNumber;
      const result = pinOnly ? await confirmSupervisorByPin(fullPin) : await confirmSupervisor(employeeNumber, fullPin);
      if (result.ok) {
        onConfirmed(result.supervisor, reason);
        return;
      }
      if (result.reason === 'shared-pin') {
        setAskNumber(true);
        setNumberGiven(false);
      }
      setProblem(
        result.reason === 'not-a-supervisor'
          ? { tone: 'blocked', title: 'Not a supervisor', message: notSupervisorMessage }
          : result.reason === 'wrong-details' && pinOnly
            ? { tone: 'warning', title: 'Not a supervisor PIN', message: `That PIN isn't a supervisor's here. ${notSupervisorMessage}` }
            : pinProblem(result, pinOnly),
      );
    } catch {
      setProblem({ tone: 'warning', title: 'Try again', message: "Couldn't check the PIN. Enter it again." });
    } finally {
      setChecking(false);
      setPin('');
    }
  };

  const onDigit = (digit: string) => {
    setProblem(null);
    if (!enteringPin) {
      if (employeeNumber.length < EMPLOYEE_NUMBER_MAX_LENGTH) setEmployeeNumber(employeeNumber + digit);
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const onDelete = () => {
    if (enteringPin) setPin(pin.slice(0, -1));
    else setEmployeeNumber(employeeNumber.slice(0, -1));
  };

  return (
    <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Cancel" tone="dark" onPress={onCancel} />
        <Chip label={chip} icon="override" />
      </View>

      {!reason ? (
        <ScrollView contentContainerStyle={styles.reasons}>
          <Text variant="title">Why is it safe to let them through?</Text>
          <Text variant="label" color={colors.inkMuted}>
            The reason is recorded with the supervisor who approved it.
          </Text>
          {REASONS.map((option) => (
            <PillButton key={option} label={option} variant="secondary" onPress={() => setReason(option)} />
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={styles.heading}>
            <Text variant="title">{enteringPin ? 'Supervisor PIN' : 'Supervisor employee number'}</Text>
            {askNumber && numberGiven ? (
              <Text variant="label" color={colors.inkMuted}>
                {`Employee ${employeeNumber}`}
              </Text>
            ) : null}
            <Text variant="label" color={colors.inkMuted}>
              {reason}
            </Text>
          </View>
          <View style={styles.entry}>
            {enteringPin ? (
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
            {!askNumber ? null : enteringPin ? (
              <PillButton
                label="Change employee number"
                variant="secondary"
                onPress={() => {
                  setNumberGiven(false);
                  setPin('');
                }}
              />
            ) : (
              <PillButton label="Continue" disabled={employeeNumber.length === 0} onPress={() => setNumberGiven(true)} />
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.lg,
    gap: space.lg,
    backgroundColor: colors.background,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reasons: {
    gap: space.sm,
    paddingBottom: space.xl,
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
});
