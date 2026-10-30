import { normaliseIdentifier } from '@digigate/core';
import { colors, radius, space, typography } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DocumentPreview } from '@/components/document-preview';
import { DocumentSheet } from '@/components/document-sheet';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PersonCard } from '@/components/person-card';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { VehicleCard } from '@/components/vehicle-card';
import { VisitTypePicker } from '@/components/visit-type-picker';
import { useLocalDatabase } from '@/db/database-context';
import { signalOutcome } from '@/lib/feedback';
import { formatPlate, plateInput } from '@/lib/format';
import { siteConfig } from '@/site/site-config';
import { usePost } from '@/shift/shift-context';
import { useSync } from '@/sync/sync-context';

import { SupervisorOverride } from './supervisor-override';
import { useVehicleDocuments } from './use-vehicle-documents';
import { recordDecision, type Decision, type Direction } from './decision';
import { CheckResult, type Settled } from './check-result';
import { completedExitChecks, ExitChecksCard, NO_EXIT_CHECKS, type ExitChecks } from './exit-checks';
import { checkVehicle, type CheckedVehicle, type Passage } from './vehicle-check';

const FOOTER_HEIGHT = 160;
const MIN_PLATE_LENGTH = 2;

const COPY = {
  entry: { overline: 'Vehicle entry', title: "Who's coming in?", chip: 'Entry', icon: 'entry', people: 'People in the car' },
  exit: { overline: 'Vehicle exit', title: "Who's leaving?", chip: 'Exit', icon: 'exit', people: 'People leaving in the car' },
} as const satisfies Record<Direction, { overline: string; title: string; chip: string; icon: IconName; people: string }>;

export function VehicleCheckScreen({ direction }: { direction: Direction }) {
  const user = useCurrentUser();
  // The screen sits inside the signed-in stack; while it closes after a sign-out there is no guard to record against.
  return user ? <VehicleCheck direction={direction} guard={user} /> : null;
}

function VehicleCheck({ direction, guard }: { direction: Direction; guard: GateUser }) {
  const insets = useSafeAreaInsets();
  const { db } = useLocalDatabase();
  const { eventRecorded } = useSync();
  const post = usePost();
  const [checked, setChecked] = useState<CheckedVehicle | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [details, setDetails] = useState<'licence' | 'disc' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [typedPlate, setTypedPlate] = useState('');
  const [occupants, setOccupants] = useState(1);
  const [visitType, setVisitType] = useState<string>(siteConfig.defaultVisitType);
  const [exitChecks, setExitChecks] = useState<ExitChecks>(NO_EXIT_CHECKS);
  const documents = useVehicleDocuments(checked === null);
  const { disc, licence, photo, notice } = documents;
  const copy = COPY[direction];

  const completedChecks = completedExitChecks(exitChecks);
  const passage: Passage | null = direction === 'entry' ? { direction } : completedChecks && { direction, ...completedChecks };
  const ready = disc !== null && licence !== null && passage !== null && normaliseIdentifier(typedPlate).length >= MIN_PLATE_LENGTH;

  const runCheck = async () => {
    if (!disc || !licence || !passage) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await checkVehicle(db, { ...passage, disc, licence, typedPlate, occupants, visitType, guardId: guard.id });
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
      setOverriding(false);
    }
  };

  const nextCar = () => {
    documents.reset();
    setChecked(null);
    setSettled(null);
    setDetails(null);
    setProblem(null);
    setTypedPlate('');
    setOccupants(1);
    setVisitType(siteConfig.defaultVisitType);
    setExitChecks(NO_EXIT_CHECKS);
  };

  const finished = checked !== null && (checked.outcome === 'clear' || settled !== null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_HEIGHT }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label={`${post.label} · ${copy.chip}`} icon={copy.icon} />
        </View>

        {checked ? (
          <CheckResult
            outcome={checked.outcome}
            hits={checked.hits}
            related={checked.related}
            settled={settled}
            clearMessage={
              direction === 'entry'
                ? 'No flags on this car or driver. Open the boom. The visit has started.'
                : 'This driver brought this car in. Open the boom. The visit has ended.'
            }
            letThroughMessage={direction === 'entry' ? 'Open the boom. The visit has started.' : 'Open the boom. The visit has ended.'}
          />
        ) : (
          <View style={styles.heading}>
            <Text variant="overline" color={colors.inkMuted}>
              {copy.overline}
            </Text>
            <Text variant="display">{copy.title}</Text>
          </View>
        )}

        {problem ? <ResultBanner tone="warning" title="Not saved" message={problem} /> : null}
        {notice && !checked ? <ResultBanner tone="warning" title={notice.title} message={notice.message} /> : null}

        {licence ? <PersonCard document={{ kind: 'driver-licence', licence, photo }} onOpen={() => setDetails('licence')} /> : null}

        {/* The disc's details include its plate, so they open only after the check (see the plate input below). */}
        {disc ? <VehicleCard disc={disc} {...(checked ? { onOpen: () => setDetails('disc') } : {})} /> : null}

        {disc && licence ? null : (
          <Card style={styles.documents}>
            {disc ? null : (
              <DocumentRow icon="licence-disc" tint={colors.tileSky} caption="Licence disc" value="Scan the disc" detail="On the windscreen" />
            )}
            {disc || licence ? null : <View style={styles.divider} />}
            {licence ? null : (
              <DocumentRow
                icon="licence-card"
                tint={colors.tileLilac}
                caption="Driver's licence"
                value="Scan the licence"
                detail="The barcode on the back"
              />
            )}
          </Card>
        )}

        <Card style={styles.plate}>
          <Text variant="overline" color={colors.inkMuted}>
            Plate on the car
          </Text>
          {checked && disc ? (
            <View style={styles.plateRow}>
              <Text variant="title">{formatPlate(normaliseIdentifier(typedPlate))}</Text>
              {normaliseIdentifier(typedPlate) === normaliseIdentifier(disc.plate) ? (
                <Chip label="Matches disc" icon="check" tone="clear" />
              ) : (
                <Chip label={`Disc says ${formatPlate(disc.plate)}`} icon="result-blocked" tone="blocked" />
              )}
            </View>
          ) : (
            // The disc's own plate stays hidden until the check, so the guard reads it off the car, not the screen.
            <TextInput
              value={typedPlate}
              onChangeText={(text) => setTypedPlate(plateInput(text))}
              placeholder="Type the plate"
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              maxLength={12}
              style={styles.plateInput}
              accessibilityLabel="Plate on the car"
            />
          )}
        </Card>

        <Card style={styles.occupants}>
          <View style={styles.occupantsCopy}>
            <Text variant="bodyStrong">{copy.people}</Text>
            <Text variant="label" color={colors.inkMuted}>
              Including the driver
            </Text>
          </View>
          <View style={styles.stepper}>
            <IconButton
              icon="remove"
              label="One person fewer"
              onPress={!checked && occupants > 1 ? () => setOccupants(occupants - 1) : undefined}
            />
            <Text variant="stat" style={styles.count}>
              {occupants}
            </Text>
            <IconButton icon="add" label="One person more" onPress={!checked ? () => setOccupants(occupants + 1) : undefined} />
          </View>
        </Card>

        {direction === 'entry' ? (
          <VisitTypePicker value={visitType} onChange={setVisitType} locked={checked !== null} />
        ) : (
          <ExitChecksCard value={exitChecks} onChange={setExitChecks} locked={checked !== null} />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {!checked ? (
          <PillButton label="Check" icon="check" disabled={!ready || busy} onPress={runCheck} />
        ) : finished ? (
          <PillButton label="Next car" icon={copy.icon} onPress={nextCar} />
        ) : checked.outcome === 'warning' ? (
          <>
            <PillButton label="Let them through" icon="check" disabled={busy} onPress={() => decide({ kind: 'acknowledged' })} />
            <PillButton label="Turn away" icon="result-blocked" variant="secondary" disabled={busy} onPress={() => decide({ kind: 'turned-away' })} />
          </>
        ) : (
          <>
            <PillButton label="Supervisor override" icon="override" disabled={busy} onPress={() => setOverriding(true)} />
            <PillButton label="Turn away" icon="result-blocked" variant="secondary" disabled={busy} onPress={() => decide({ kind: 'turned-away' })} />
          </>
        )}
      </View>

      {details === 'licence' && licence ? (
        <DocumentSheet onClose={() => setDetails(null)}>
          <DocumentPreview decoded={{ kind: 'driver-licence', licence }} photo={photo} />
        </DocumentSheet>
      ) : null}

      {details === 'disc' && disc ? (
        <DocumentSheet onClose={() => setDetails(null)}>
          <DocumentPreview decoded={{ kind: 'licence-disc', disc }} photo={null} />
        </DocumentSheet>
      ) : null}

      {overriding ? (
        <SupervisorOverride
          onCancel={() => setOverriding(false)}
          onConfirmed={(supervisor, reason) => decide({ kind: 'override', supervisorId: supervisor.id, reason })}
        />
      ) : null}
    </View>
  );
}

/** A document still to scan. */
function DocumentRow({ icon, tint, caption, value, detail }: { icon: IconName; tint: string; caption: string; value: string; detail: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={22} />
      </View>
      <View style={styles.rowCopy}>
        <Text variant="overline" color={colors.inkMuted}>
          {caption}
        </Text>
        <Text variant="bodyStrong">{value}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
      <Icon name="scan" size={26} color={colors.inkSubtle} />
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
  documents: {
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  plate: {
    gap: space.xs,
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  plateInput: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.title,
    letterSpacing: 2,
  },
  occupants: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  occupantsCopy: {
    flex: 1,
    gap: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  count: {
    minWidth: 28,
    textAlign: 'center',
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
