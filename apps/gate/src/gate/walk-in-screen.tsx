import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DocumentPreview, IdBookPreview } from '@/components/document-preview';
import { DocumentSheet } from '@/components/document-sheet';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PersonCard, type PersonDocument } from '@/components/person-card';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { VisitTypePicker } from '@/components/visit-type-picker';
import { useLocalDatabase } from '@/db/database-context';
import { signalOutcome } from '@/lib/feedback';
import { siteConfig } from '@/site/site-config';
import { usePost } from '@/shift/shift-context';
import { useSync } from '@/sync/sync-context';

import { CheckResult, type Settled } from './check-result';
import { recordDecision, type Decision, type Direction } from './decision';
import { IdNumberPopup } from './id-number-popup';
import { usePersonDocument } from './use-person-document';
import { usePersonVisits } from './use-person-visits';
import { VisitSummary } from './visit-summary';
import { checkPerson, type CheckedPerson } from './walk-in-check';

const FOOTER_HEIGHT = 160;

const COPY = {
  entry: {
    overline: 'Walking in',
    title: "Who's walking in?",
    icon: 'entry',
    clear: 'No flags on this person. Let them in. The visit has started.',
    through: 'Let them in. The visit has started.',
  },
  exit: {
    overline: 'Walking out',
    title: "Who's walking out?",
    icon: 'exit',
    clear: 'This person walked in. Let them out. The visit has ended.',
    through: 'Let them out. The visit has ended.',
  },
} as const;

/** Every detail of the person's document, for the details sheet. */
function Details({ person }: { person: PersonDocument }) {
  switch (person.kind) {
    case 'driver-licence':
      return <DocumentPreview decoded={{ kind: 'driver-licence', licence: person.licence }} photo={person.photo} />;
    case 'smart-id':
      return <DocumentPreview decoded={{ kind: 'smart-id', card: person.card }} photo={null} />;
    case 'id-book':
      return <IdBookPreview book={person} />;
  }
}

export function WalkInScreen({ direction }: { direction: Direction }) {
  const user = useCurrentUser();
  // The screen sits inside the signed-in stack; while it closes after a sign-out there is no guard to record against.
  return user ? <WalkIn direction={direction} guard={user} /> : null;
}

function WalkIn({ direction, guard }: { direction: Direction; guard: GateUser }) {
  const insets = useSafeAreaInsets();
  const { db } = useLocalDatabase();
  const { eventRecorded } = useSync();
  const post = usePost();
  const [visitType, setVisitType] = useState<string>(siteConfig.defaultVisitType);
  const [checked, setChecked] = useState<CheckedPerson | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [showingDetails, setShowingDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const scan = usePersonDocument(checked === null);
  const { person, notice } = scan;
  const visits = usePersonVisits(direction === 'exit' ? person : null);
  const copy = COPY[direction];

  const runCheck = async () => {
    if (!person) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await checkPerson(db, { direction, person, visitType, guardId: guard.id });
      setChecked(result);
      signalOutcome(result.outcome);
      eventRecorded();
    } catch (cause) {
      setProblem(`Nothing was recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Press Check again.`);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: Decision) => {
    if (!checked) return;
    setBusy(true);
    setProblem(null);
    try {
      await recordDecision(db, checked, decision, guard.id);
      setSettled(decision.kind === 'turned-away' ? 'turned-away' : 'let-through');
      eventRecorded();
    } catch (cause) {
      setProblem(`That wasn't recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Try again.`);
    } finally {
      setBusy(false);
    }
  };

  const nextPerson = () => {
    scan.reset();
    setChecked(null);
    setSettled(null);
    setShowingDetails(false);
    setProblem(null);
    setVisitType(siteConfig.defaultVisitType);
  };

  const finished = checked !== null && (checked.outcome === 'clear' || settled !== null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_HEIGHT }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label={`${post.label} · ${copy.overline}`} icon={copy.icon} />
        </View>

        {checked ? (
          <CheckResult
            outcome={checked.outcome}
            hits={checked.hits}
            related={checked.related}
            settled={settled}
            clearMessage={copy.clear}
            letThroughMessage={copy.through}
          />
        ) : (
          <View style={styles.heading}>
            <Text variant="overline" color={colors.inkMuted}>
              {`Walk-in · ${copy.overline}`}
            </Text>
            <Text variant="display">{copy.title}</Text>
          </View>
        )}

        {problem ? <ResultBanner tone="warning" title="Not saved" message={problem} /> : null}
        {notice && !checked ? <ResultBanner tone="warning" title={notice.title} message={notice.message} /> : null}

        {person ? (
          <PersonCard document={person} onOpen={() => setShowingDetails(true)} />
        ) : (
          <Card style={styles.prompt}>
            <View style={styles.promptIcon}>
              <Icon name="id-card" size={26} color={colors.brand} />
            </View>
            <View style={styles.promptCopy}>
              <Text variant="bodyStrong">Scan their smart ID or licence</Text>
              <Text variant="label" color={colors.inkMuted}>
                The barcode on the back of the card
              </Text>
            </View>
            <Icon name="scan" size={26} color={colors.inkSubtle} />
          </Card>
        )}

        {direction === 'exit' && person ? <VisitSummary visits={visits} /> : null}

        {direction === 'entry' ? <VisitTypePicker value={visitType} onChange={setVisitType} locked={checked !== null} /> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {!checked ? (
          <PillButton label="Check" icon="check" disabled={!person || busy} onPress={runCheck} />
        ) : finished ? (
          <PillButton label="Next person" icon="pedestrian" onPress={nextPerson} />
        ) : (
          <>
            <PillButton label="Let them through" icon="check" disabled={busy} onPress={() => decide({ kind: 'acknowledged' })} />
            <PillButton label="Turn away" icon="result-blocked" variant="secondary" disabled={busy} onPress={() => decide({ kind: 'turned-away' })} />
          </>
        )}
      </View>

      {showingDetails && person ? (
        <DocumentSheet onClose={() => setShowingDetails(false)}>
          <Details person={person} />
        </DocumentSheet>
      ) : null}

      {scan.idNumberOnly && !checked ? (
        <IdNumberPopup idNumber={scan.idNumberOnly} onRetry={scan.retryForSmartId} onIdBook={scan.acceptIdBook} onCancel={scan.dismissIdNumber} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.lg,
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
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  promptIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tileSky,
  },
  promptCopy: {
    flex: 1,
    gap: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    gap: space.xs,
    backgroundColor: colors.background,
  },
});
