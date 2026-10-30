import type { BootCheck, IgnitionRestart } from '@digigate/core';
import { colors, space } from '@digigate/design';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import type { IconName } from '@/components/icon';
import { OptionTile } from '@/components/option-tile';
import { Text } from '@/components/text';

export type ExitChecks = {
  ignition: IgnitionRestart | null;
  bootOpened: boolean;
  bootResult: 'clear' | 'problem' | null;
};

export const NO_EXIT_CHECKS: ExitChecks = { ignition: null, bootOpened: false, bootResult: null };

/** What the rules need to know, or null while the guard still owes an answer. */
export function completedExitChecks(checks: ExitChecks): { ignitionRestart: IgnitionRestart; bootCheck: BootCheck } | null {
  if (!checks.ignition) return null;
  if (!checks.bootOpened) return { ignitionRestart: checks.ignition, bootCheck: 'not-needed' };
  return checks.bootResult ? { ignitionRestart: checks.ignition, bootCheck: checks.bootResult } : null;
}

type Choice<Value extends string> = { value: Value; label: string; icon: IconName; tint: 'clearSoft' | 'blockedSoft' };

const IGNITION_CHOICES: readonly Choice<IgnitionRestart>[] = [
  { value: 'done', label: 'Done', icon: 'check', tint: 'clearSoft' },
  { value: 'failed', label: "Couldn't", icon: 'result-blocked', tint: 'blockedSoft' },
];

const BOOT_CHOICES: readonly Choice<'clear' | 'problem'>[] = [
  { value: 'clear', label: 'Nothing found', icon: 'check', tint: 'clearSoft' },
  { value: 'problem', label: 'Problem', icon: 'result-warning', tint: 'blockedSoft' },
];

/** The two tiles of a question. Once the check has run, only the recorded answer stays. */
function Choices<Value extends string>({
  choices,
  value,
  onChange,
  locked,
}: {
  choices: readonly Choice<Value>[];
  value: Value | null;
  onChange: (value: Value) => void;
  locked: boolean;
}) {
  return (
    <View style={styles.tiles} accessibilityRole="radiogroup">
      {choices
        .filter((choice) => !locked || choice.value === value)
        .map((choice) => (
          <OptionTile
            key={choice.value}
            label={choice.label}
            icon={choice.icon}
            tint={choice.tint}
            selected={choice.value === value}
            stacked
            {...(locked ? {} : { onPress: () => onChange(choice.value) })}
          />
        ))}
    </View>
  );
}

/**
 * What the guard checks at the car before an exit. Restarting the engine is required for every car, because a car
 * taken without its key can't be stopped and started again. The boot is opened only when something looks suspicious.
 */
export function ExitChecksCard({ value, onChange, locked }: { value: ExitChecks; onChange: (next: ExitChecks) => void; locked: boolean }) {
  return (
    <Card style={styles.card}>
      <View style={styles.question}>
        <View style={styles.copy}>
          <Text variant="bodyStrong">Stop and start the engine</Text>
          <Text variant="label" color={colors.inkMuted}>
            Ask the driver to switch off, then start the car again.
          </Text>
        </View>
        <Choices choices={IGNITION_CHOICES} value={value.ignition} onChange={(ignition) => onChange({ ...value, ignition })} locked={locked} />
      </View>

      <View style={styles.divider} />

      <View style={styles.question}>
        <View style={styles.switchRow}>
          <View style={styles.copy}>
            <Text variant="bodyStrong">Check the boot</Text>
            <Text variant="label" color={colors.inkMuted}>
              {locked && !value.bootOpened ? 'Not opened.' : 'Switch on if something looks suspicious.'}
            </Text>
          </View>
          <Switch
            value={value.bootOpened}
            onValueChange={(bootOpened) => onChange({ ...value, bootOpened, bootResult: null })}
            disabled={locked}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor={colors.surface}
            accessibilityLabel="Check the boot"
          />
        </View>
        {value.bootOpened ? (
          <Choices choices={BOOT_CHOICES} value={value.bootResult} onChange={(bootResult) => onChange({ ...value, bootResult })} locked={locked} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  question: {
    gap: space.sm,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
