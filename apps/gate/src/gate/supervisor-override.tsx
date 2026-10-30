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
};

/** A supervisor lets a blocked vehicle through: reason, then their own employee number and PIN. */
export function SupervisorOverride({ onConfirmed, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { confirmSupervisor } = useSession();
  const [reason, setReason] = useState<string | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [enteringPin, setEnteringPin] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<PinProblem | null>(null);

  const submit = async (fullPin: string) => {
    if (!reason) return;
    setChecking(true);
    try {
      const result = await confirmSupervisor(employeeNumber, fullPin);
      if (result.ok) {
        onConfirmed(result.supervisor, reason);
        return;
      }
      setProblem(
        result.reason === 'not-a-supervisor'
          ? { tone: 'blocked', title: 'Not a supervisor', message: 'Only a supervisor can override a block. Call one to the gate.' }
          : pinProblem(result),
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
        <IconButton icon="close" label="Cancel override" tone="dark" onPress={onCancel} />
        <Chip label="Supervisor override" icon="override" />
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
            {enteringPin ? (
              <PillButton
                label="Change employee number"
                variant="secondary"
                onPress={() => {
                  setEnteringPin(false);
                  setPin('');
                }}
              />
            ) : (
              <PillButton label="Continue" disabled={employeeNumber.length === 0} onPress={() => setEnteringPin(true)} />
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
