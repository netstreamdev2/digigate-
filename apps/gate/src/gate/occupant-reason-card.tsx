import { occupantChange } from '@digigate/core';
import { colors, space } from '@digigate/design';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { occupantReasons } from '@/site/site-config';

type Props = {
  cameIn: number;
  leaving: number;
  /** Saves the reason. Resolves once it's on record. */
  onReason: (change: 'fewer' | 'more', reason: string) => Promise<void>;
};

/**
 * A car leaving with a different number of people than came in. Never an alarm (a patient dropped off, a spouse
 * fetched): it's noted, and the guard can say why, in one tap, while the car goes through.
 */
export function OccupantReasonCard({ cameIn, leaving, onReason }: Props) {
  const change = occupantChange(cameIn, leaving);
  const [given, setGiven] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!change) return null;

  const choose = async (reason: string) => {
    setSaving(true);
    setProblem(null);
    try {
      await onReason(change, reason);
      setGiven(reason);
    } catch (cause) {
      setProblem(`That wasn't saved (${cause instanceof Error ? cause.message : 'unknown error'}). Tap it again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon name="occupants" size={26} />
        <View style={styles.copy}>
          <Text variant="bodyStrong">{change === 'fewer' ? 'Fewer people leaving' : 'More people leaving'}</Text>
          <Text variant="label" color={colors.inkMuted}>
            {`${cameIn} came in, ${leaving} leaving. Not an alarm: just say why if you know.`}
          </Text>
        </View>
      </View>
      {given ? (
        <View style={styles.given}>
          <Icon name="check" size={20} color={colors.clear} />
          <Text variant="label" color={colors.clear}>{`Noted: ${given}`}</Text>
        </View>
      ) : (
        <View style={styles.chips}>
          {occupantReasons(change).map((reason) => (
            <Chip key={reason} label={reason} {...(saving ? {} : { onPress: () => void choose(reason) })} />
          ))}
        </View>
      )}
      {problem ? (
        <Text variant="label" color={colors.warning}>
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  given: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
