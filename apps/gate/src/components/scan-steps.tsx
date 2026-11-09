import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ScanStep = {
  key: string;
  icon: IconName;
  tint: keyof typeof colors;
  /** The document, e.g. Licence disc. */
  title: string;
  /** What to do with it, e.g. Aim at the barcode on the disc. */
  instruction: string;
  /** Where to find it, e.g. Inside the windscreen. */
  where: string;
  done: boolean;
};

/**
 * What still has to be scanned, as instructions, never as buttons: the scanner is always on and the guard presses a
 * scan key on the side of the handheld, so nothing here can be tapped or looks as if it could. Each document still
 * waiting has a dashed outline and says what to aim at and where it is; a scanned one is replaced by its card above.
 */
export function ScanSteps({ steps }: { steps: readonly ScanStep[] }) {
  const waiting = steps.filter((step) => !step.done);
  if (waiting.length === 0) return null;
  const scanned = steps.length - waiting.length;

  return (
    <View style={styles.section} accessibilityRole="summary">
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Icon name="scan" size={22} color={colors.inkInverse} />
        </View>
        <View style={styles.headingCopy}>
          <Text variant="bodyStrong">Press a scan button on the side</Text>
          <Text variant="label" color={colors.inkMuted}>
            {steps.length > 1 ? 'Aim at each barcode, in any order.' : 'Aim at the barcode.'}
          </Text>
        </View>
        {steps.length > 1 ? (
          <Text variant="label" color={colors.inkMuted} style={styles.count}>
            {`${scanned} of ${steps.length}\nscanned`}
          </Text>
        ) : null}
      </View>

      {waiting.map((step) => (
        <View key={step.key} style={styles.step} accessibilityLabel={`${step.title}: ${step.instruction}. ${step.where}. Waiting.`}>
          <View style={[styles.stepIcon, { backgroundColor: colors[step.tint] }]}>
            <Icon name={step.icon} size={24} />
          </View>
          <View style={styles.stepCopy}>
            <Text variant="overline" color={colors.inkMuted}>
              {step.title}
            </Text>
            <Text variant="bodyStrong">{step.instruction}</Text>
            <Text variant="label" color={colors.inkMuted}>
              {step.where}
            </Text>
          </View>
          <View style={styles.waiting}>
            <View style={styles.waitingDot} />
            <Text variant="label" color={colors.inkMuted}>
              Waiting
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headingIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  headingCopy: {
    flex: 1,
    gap: 2,
  },
  count: {
    textAlign: 'right',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  waiting: {
    alignItems: 'center',
    gap: 4,
  },
  waitingDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.inkSubtle,
  },
});
