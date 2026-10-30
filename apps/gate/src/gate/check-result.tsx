import type { Outcome, RuleHit } from '@digigate/core';
import { colors, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import type { VisitDetails } from '@/db/visits';
import { formatPlate, titleCase } from '@/lib/format';
import { ruleCopy } from '@/lib/rule-copy';

/** What the guard did after a warning or block. */
export type Settled = 'let-through' | 'turned-away';

const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

type Props = {
  outcome: Outcome;
  hits: readonly RuleHit[];
  related: ReadonlyMap<string, VisitDetails>;
  settled: Settled | null;
  /** The clear message, with what happens next, e.g. "No flags on this car or driver. Open the boom." */
  clearMessage: string;
  /** Said when the guard lets them through after a warning or override. */
  letThroughMessage: string;
};

/** The result, first on screen: a banner the guard reads at a glance, then every hit and the visits behind it. */
export function CheckResult({ outcome, hits, related, settled, clearMessage, letThroughMessage }: Props) {
  const top = hits[0];
  const banner =
    settled === 'turned-away'
      ? { tone: 'blocked' as const, title: 'Turned away', message: 'Keep the boom closed. The attempt is recorded.' }
      : settled === 'let-through'
        ? { tone: 'clear' as const, title: 'Let through', message: letThroughMessage }
        : outcome === 'clear' || !top
          ? { tone: 'clear' as const, title: 'All clear', message: clearMessage }
          : outcome === 'warning'
            ? { tone: 'warning' as const, title: ruleCopy[top.code].title, message: `${ruleCopy[top.code].message} Look closely, then let them through or turn them away.` }
            : { tone: 'blocked' as const, title: ruleCopy[top.code].title, message: ruleCopy[top.code].message };

  return (
    <>
      <ResultBanner tone={banner.tone} title={banner.title} message={banner.message} />
      {hits.length > 0 ? (
        <Card style={styles.hits}>
          {hits.map((ruleHit) => {
            const visit = ruleHit.relatedVisitId ? related.get(ruleHit.relatedVisitId) : undefined;
            const context = visit
              ? [titleCase(visit.personName), visit.vehicleDescription, visit.plate ? formatPlate(visit.plate) : null, `in at ${timeOf(visit.enteredAt)}`]
                  .filter((part): part is string => part !== null)
                  .join(' · ')
              : null;
            const tone =
              ruleHit.severity === 'red'
                ? { icon: 'result-blocked' as const, color: colors.blocked }
                : ruleHit.severity === 'amber'
                  ? { icon: 'result-warning' as const, color: colors.warning }
                  : { icon: 'info' as const, color: colors.brand };
            return (
              <View key={`${ruleHit.code}-${ruleHit.relatedVisitId ?? ''}`} style={styles.hit}>
                <Icon name={tone.icon} size={20} color={tone.color} />
                <View style={styles.hitCopy}>
                  <Text variant="bodyStrong">{ruleCopy[ruleHit.code].title}</Text>
                  {context ? (
                    <Text variant="label" color={colors.inkMuted}>
                      {context}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hits: {
    gap: space.sm,
  },
  hit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  hitCopy: {
    flex: 1,
    gap: 2,
  },
});
