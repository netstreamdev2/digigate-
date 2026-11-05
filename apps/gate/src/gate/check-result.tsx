import type { Outcome, RuleHit } from '@digigate/core';
import { colors, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import type { VisitDetails } from '@/db/visits';
import type { SyncedBooking } from '@/db/watch-lists';
import { formatPlate, titleCase } from '@/lib/format';
import type { GateWords } from '@/lib/gate-words';
import { ruleCopy, ruleMessage } from '@/lib/rule-copy';

/** What the guard did after a warning or block. */
export type Settled = 'let-through' | 'turned-away';

const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

type Props = {
  outcome: Outcome;
  hits: readonly RuleHit[];
  related: ReadonlyMap<string, VisitDetails>;
  settled: Settled | null;
  /** The clear message, with what happens next, e.g. "No flags on this car or driver. Let them in." */
  clearMessage: string;
  /** Said when the guard lets them through after a warning or override. */
  letThroughMessage: string;
  /** What the company asked the guard to do, by hotlist entry. */
  hotlistNotes?: ReadonlyMap<string, string>;
  /** The booking that expects them, on the way in. */
  expected?: SyncedBooking | null;
  /** What to tell the guard to do, in the words of their gate: a boom, an open gate, or a walk-in gate. */
  words: GateWords;
};

const NO_NOTES: ReadonlyMap<string, string> = new Map();

/** The result, first on screen: a banner the guard reads at a glance, then every hit and the visits behind it. */
export function CheckResult({ outcome, hits, related, settled, clearMessage, letThroughMessage, hotlistNotes = NO_NOTES, expected = null, words }: Props) {
  const top = hits[0];
  const banner =
    settled === 'turned-away'
      ? { tone: 'blocked' as const, title: 'Turned away', message: words.turnedAway }
      : settled === 'let-through'
        ? { tone: 'clear' as const, title: 'Let through', message: letThroughMessage }
        : outcome === 'clear' || !top
          ? { tone: 'clear' as const, title: 'All clear', message: clearMessage }
          : outcome === 'warning'
            ? { tone: 'warning' as const, title: ruleCopy[top.code].title, message: `${ruleMessage(top.code, words)} Look closely, then let them through or turn them away.` }
            : { tone: 'blocked' as const, title: ruleCopy[top.code].title, message: ruleMessage(top.code, words) };

  return (
    <>
      <ResultBanner tone={banner.tone} title={banner.title} message={banner.message} />
      {expected ? (
        <Card style={styles.expected}>
          <Icon name="visitor" size={22} color={colors.brand} />
          <View style={styles.hitCopy}>
            <Text variant="bodyStrong">{`Expected: ${titleCase(expected.name)}`}</Text>
            <Text variant="label" color={colors.inkMuted}>
              {[expected.visitType ? titleCase(expected.visitType.replace(/_/g, ' ')) : null, expected.note, 'Check the name on their document matches.']
                .filter((part): part is string => part !== null && part !== '')
                .join(' · ')}
            </Text>
          </View>
        </Card>
      ) : null}
      {hits.length > 0 ? (
        <Card style={styles.hits}>
          {hits.map((ruleHit) => {
            const visit = ruleHit.relatedVisitId ? related.get(ruleHit.relatedVisitId) : undefined;
            const note = ruleHit.hotlistEntryId ? hotlistNotes.get(ruleHit.hotlistEntryId) : undefined;
            const context = note
              ? `The company says: ${note}`
              : visit
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
              <View key={`${ruleHit.code}-${ruleHit.relatedVisitId ?? ruleHit.hotlistEntryId ?? ''}`} style={styles.hit}>
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
  expected: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
