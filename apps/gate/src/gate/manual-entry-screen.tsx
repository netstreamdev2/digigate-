import { occupantTotal, type OccupantsBySex } from '@digigate/core';
import { colors, radius, space, typography } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import type { IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { KeyboardInput, KeyboardScroll, useKeyboardHeight } from '@/components/keyboard-scroll';
import { OptionTile } from '@/components/option-tile';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { driverOnly, OccupantCounter } from '@/components/occupant-counter';
import { StayPicker } from '@/components/stay-picker';
import { VisitTypePicker } from '@/components/visit-type-picker';
import { useLocalDatabase } from '@/db/database-context';
import { masked, rememberLastScan, settleLastScan, visitTypeLabel } from '@/db/last-scan';
import { signalOutcome } from '@/lib/feedback';
import { nameInput, titleCase } from '@/lib/format';
import { gateWords, vehicleGateWords, type GateWords } from '@/lib/gate-words';
import { expectedStayFor, siteConfig, visitTypeOf, type Lane } from '@/site/site-config';
import { usePost } from '@/shift/shift-context';
import { useSync } from '@/sync/sync-context';

import { CheckResult, type Settled } from './check-result';
import { recordDecision, recordOccupantReason, type Decision } from './decision';
import { OccupantReasonCard } from './occupant-reason-card';
import { completedExitChecks, ExitChecksCard, NO_EXIT_CHECKS, type ExitChecks } from './exit-checks';
import { PlateCamera } from './plate-camera';
import { PlateField } from './plate-field';
import { SupervisorOverride } from './supervisor-override';
import { typedIdentity } from './typed-identity';
import { useKeepPlatePhoto } from './use-keep-plate-photo';
import { usePlateEntry } from './use-plate-entry';
import { checkVehicle, typedSubject, type CheckedVehicle } from './vehicle-check';
import { checkPerson, type CheckedPerson } from './walk-in-check';

// For whatever can't be scanned: a foreign passport or licence, a damaged card, a car with no disc. Everything typed here
// goes through the same rules as a scan and is marked as typed on the record, with the reason.

type Movement = 'car-in' | 'car-out' | 'walk-in' | 'walk-out';

const MOVEMENTS: readonly { code: Movement; lane: Lane; label: string; icon: IconName; tint: keyof typeof colors }[] = [
  { code: 'car-in', lane: 'vehicle', label: 'Car coming in', icon: 'entry', tint: 'tileSky' },
  { code: 'car-out', lane: 'vehicle', label: 'Car leaving', icon: 'exit', tint: 'surfaceMuted' },
  { code: 'walk-in', lane: 'pedestrian', label: 'Walking in', icon: 'pedestrian', tint: 'tileMint' },
  { code: 'walk-out', lane: 'pedestrian', label: 'Walking out', icon: 'exit', tint: 'surfaceMuted' },
];

const REASONS: Record<Lane, readonly string[]> = {
  vehicle: ["Licence won't scan", "Disc won't scan", 'Foreign licence', 'Foreign plates or no disc'],
  pedestrian: ["Card won't scan", 'Foreign passport', 'Document has no barcode'],
};

const resultCopy = (words: GateWords): Record<Movement, { clear: string; through: string }> => ({
  'car-in': { clear: `No flags on this car or driver. ${words.letIn} The visit has started.`, through: `${words.letIn} The visit has started.` },
  'car-out': { clear: `This driver brought this car in. ${words.letOut} The visit has ended.`, through: `${words.letOut} The visit has ended.` },
  'walk-in': { clear: 'No flags on this person. Let them in. The visit has started.', through: 'Let them in. The visit has started.' },
  'walk-out': { clear: 'This person walked in. Let them out. The visit has ended.', through: 'Let them out. The visit has ended.' },
});

const MIN_ID_LENGTH = 5;
const MIN_PLATE_LENGTH = 2;

export function ManualEntryScreen() {
  const user = useCurrentUser();
  return user ? <ManualEntry guard={user} /> : null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="overline" color={colors.inkMuted}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function IdHint({ idNumber }: { idNumber: string }) {
  const identity = typedIdentity(idNumber);
  if (identity.idNumber.length < MIN_ID_LENGTH) return null;
  if (identity.saId) return <Chip label="South African ID number" icon="check" tone="clear" />;
  if (/^\d{13}$/.test(identity.idNumber)) return <Chip label="Not a valid SA ID number. Check it, or it's kept as another number" icon="result-warning" tone="blocked" />;
  return <Chip label="Kept as a passport or other number" icon="info" />;
}

function ManualEntry({ guard }: { guard: GateUser }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  // The footer is pinned over the bottom of the form, so a field scrolled into view must clear it too.
  const [footerHeight, setFooterHeight] = useState(0);
  const { db } = useLocalDatabase();
  const { eventRecorded } = useSync();
  const post = usePost();
  const [movement, setMovement] = useState<Movement | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [idNumber, setIdNumber] = useState('');
  const [names, setNames] = useState('');
  const [surname, setSurname] = useState('');
  const plate = usePlateEntry();
  const [makeAndModel, setMakeAndModel] = useState('');
  const [colour, setColour] = useState('');
  // A typed driver's sex isn't known, so they start as not sure until the guard says.
  const [people, setPeople] = useState<OccupantsBySex>(driverOnly(null));
  const [visitType, setVisitType] = useState<string>(siteConfig.defaultVisitType);
  const [stay, setStay] = useState<number | null>(expectedStayFor(siteConfig.defaultVisitType));
  const occupants = occupantTotal(people);
  const [exitChecks, setExitChecks] = useState<ExitChecks>(NO_EXIT_CHECKS);
  const [checked, setChecked] = useState<CheckedVehicle | CheckedPerson | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const platePhotoProblem = useKeepPlatePhoto(db, checked && (movement === 'car-in' || movement === 'car-out') ? checked.event : null, plate.photo);

  const movements = MOVEMENTS.filter((option) => post.lanes.includes(option.lane));
  const lane: Lane | null = movement === 'car-in' || movement === 'car-out' ? 'vehicle' : movement ? 'pedestrian' : null;
  const entering = movement === 'car-in' || movement === 'walk-in';
  const locked = checked !== null;
  const identity = typedIdentity(idNumber);
  const exitAnswers = completedExitChecks(exitChecks);
  const words = lane === 'pedestrian' ? gateWords('on-foot') : vehicleGateWords(post.hasBoom);

  const ready =
    movement !== null &&
    reason !== null &&
    identity.idNumber.length >= MIN_ID_LENGTH &&
    names.trim() !== '' &&
    surname.trim() !== '' &&
    (lane === 'pedestrian' || (plate.normalised.length >= MIN_PLATE_LENGTH && (entering || exitAnswers !== null)));

  const choose = (next: Movement) => {
    setMovement(next);
    if (reason && !REASONS[MOVEMENTS.find((option) => option.code === next)?.lane ?? 'vehicle'].includes(reason)) setReason(null);
  };

  const runCheck = async () => {
    if (!movement || !reason || !ready) return;
    setBusy(true);
    setProblem(null);
    const person = { idType: identity.idType, idNumber: identity.idNumber, names: names.trim(), surname: surname.trim() };
    try {
      const result =
        lane === 'vehicle'
          ? await checkVehicle(db, {
              ...(entering || !exitAnswers ? { direction: 'entry' as const } : { direction: 'exit' as const, ...exitAnswers }),
              subject: typedSubject({ plate: plate.plate, makeAndModel: makeAndModel.trim(), colour: colour.trim() }, person, reason),
              typedPlate: plate.plate,
              plateEntry: plate.payload(),
              occupants,
              occupantsBySex: people,
              visitType,
              expectedStayMinutes: stay,
              guardId: guard.id,
            })
          : await checkPerson(db, { direction: entering ? 'entry' : 'exit', person: { kind: 'typed', ...person, reason }, visitType, expectedStayMinutes: stay, guardId: guard.id });
      setChecked(result);
      signalOutcome(result.outcome);
      eventRecorded();
      rememberLastScan(db, {
        gateUserId: guard.id,
        at: result.event.occurredAt,
        direction: entering ? 'in' : 'out',
        name: titleCase(`${person.names} ${person.surname}`),
        visitType: visitTypeLabel(result.event.payload.visit_type, (code) => visitTypeOf(code)?.label ?? null),
        outcome: result.outcome,
        settled: null,
        plate: lane === 'vehicle' ? masked(plate.normalised) : null,
        vehicle: lane === 'vehicle' ? makeAndModel.trim() || 'Typed in' : null,
        people: lane === 'vehicle' ? occupants : null,
        idNumber: masked(identity.idNumber),
      });
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
      settleLastScan(db, decision.kind === 'turned-away' ? 'turned-away' : 'let-through');
    } catch (cause) {
      setProblem(`That wasn't recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Try again.`);
    } finally {
      setBusy(false);
      setOverriding(false);
    }
  };

  const finished = checked !== null && (checked.outcome === 'clear' || settled !== null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* While the keyboard is up, the form and its footer end at the keyboard's top. */}
      <KeyboardScroll
        style={{ marginBottom: keyboardHeight }}
        coveredBelow={footerHeight}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label={`${post.label} · Typed in`} icon="manual-entry" />
        </View>

        {checked && movement ? (
          <CheckResult
            outcome={checked.outcome}
            hits={checked.hits}
            related={checked.related}
            hotlistNotes={checked.hotlistNotes}
            expected={checked.expected}
            settled={settled}
            clearMessage={resultCopy(words)[movement].clear}
            letThroughMessage={resultCopy(words)[movement].through}
            words={words}
          />
        ) : (
          <View style={styles.heading}>
            <Text variant="overline" color={colors.inkMuted}>
              Type it in
            </Text>
            <Text variant="display">What can't be scanned?</Text>
            <Text variant="label" color={colors.inkMuted}>
              Everything typed here goes through the same checks as a scan, and the record shows it was typed.
            </Text>
          </View>
        )}

        {checked && 'occupantsCameIn' in checked && checked.occupantsCameIn !== null ? (
          <OccupantReasonCard
            cameIn={checked.occupantsCameIn}
            leaving={occupants}
            onReason={(change, why) => recordOccupantReason(db, checked, change, why, guard.id).then(eventRecorded)}
          />
        ) : null}

        {problem ? <ResultBanner tone="warning" title="Not saved" message={problem} /> : null}
        {platePhotoProblem ? <ResultBanner tone="warning" title="Plate photo not kept" message={platePhotoProblem} /> : null}

        <View style={styles.tiles} accessibilityRole="radiogroup">
          {movements.map((option) => (
            <OptionTile
              key={option.code}
              label={option.label}
              icon={option.icon}
              tint={option.tint}
              selected={movement === option.code}
              {...(locked ? {} : { onPress: () => choose(option.code) })}
            />
          ))}
        </View>

        {lane ? (
          <>
            <Field label="Why it's typed">
              <View style={styles.chips}>
                {REASONS[lane].map((option) => (
                  <Chip key={option} label={option} tone={reason === option ? 'selected' : 'neutral'} {...(locked ? {} : { onPress: () => setReason(option) })} />
                ))}
              </View>
            </Field>

            <Card style={styles.card}>
              <Text variant="bodyStrong">{lane === 'vehicle' ? 'The driver' : 'The person'}</Text>
              <Field label="ID or passport number">
                <KeyboardInput
                  value={idNumber}
                  onChangeText={(text) => setIdNumber(text.replace(/[^0-9A-Za-z ]/g, '').toUpperCase())}
                  placeholder="As printed on the document"
                  placeholderTextColor={colors.inkSubtle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={20}
                  editable={!locked}
                  style={styles.input}
                  accessibilityLabel="ID or passport number"
                />
                <IdHint idNumber={idNumber} />
              </Field>
              <View style={styles.pair}>
                <View style={styles.half}>
                  <Field label="First names">
                    <KeyboardInput
                      value={names}
                      onChangeText={(text) => setNames(nameInput(text))}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      editable={!locked}
                      style={styles.input}
                      accessibilityLabel="First names"
                    />
                  </Field>
                </View>
                <View style={styles.half}>
                  <Field label="Surname">
                    <KeyboardInput
                      value={surname}
                      onChangeText={(text) => setSurname(nameInput(text))}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      editable={!locked}
                      style={styles.input}
                      accessibilityLabel="Surname"
                    />
                  </Field>
                </View>
              </View>
            </Card>
          </>
        ) : null}

        {lane === 'vehicle' ? (
          <Card style={styles.card}>
            <Text variant="bodyStrong">The car</Text>
            <PlateField entry={plate} checked={locked} discPlate={null} lookAgain={false} />
            <View style={styles.pair}>
              <View style={styles.half}>
                <Field label="Make and model">
                  <KeyboardInput
                    value={makeAndModel}
                    onChangeText={setMakeAndModel}
                    placeholder="If you can tell"
                    placeholderTextColor={colors.inkSubtle}
                    autoCapitalize="words"
                    editable={!locked}
                    style={styles.input}
                    accessibilityLabel="Make and model"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="Colour">
                  <KeyboardInput
                    value={colour}
                    onChangeText={setColour}
                    placeholder="If you can tell"
                    placeholderTextColor={colors.inkSubtle}
                    autoCapitalize="words"
                    editable={!locked}
                    style={styles.input}
                    accessibilityLabel="Colour"
                  />
                </Field>
              </View>
            </View>
          </Card>
        ) : null}

        {lane === 'vehicle' ? (
          <OccupantCounter title={entering ? 'People in the car' : 'People leaving in the car'} value={people} onChange={setPeople} locked={locked} />
        ) : null}

        {lane && entering ? (
          <>
            <VisitTypePicker
              value={visitType}
              onChange={(code) => {
                setVisitType(code);
                setStay(expectedStayFor(code));
              }}
              locked={locked}
            />
            <StayPicker value={stay} onChange={setStay} locked={locked} />
          </>
        ) : null}
        {lane === 'vehicle' && !entering ? <ExitChecksCard value={exitChecks} onChange={setExitChecks} locked={locked} /> : null}
      </KeyboardScroll>

      <View
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        style={[styles.footer, { bottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? space.sm : insets.bottom + space.md }]}>
        {!checked ? (
          <PillButton label="Check" icon="check" disabled={!ready || busy} onPress={runCheck} />
        ) : finished ? (
          <PillButton label="Done" icon="check" onPress={() => router.back()} />
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

      {plate.cameraOpen ? <PlateCamera onUse={plate.acceptPhoto} onType={plate.typeIt} onCancel={plate.closeCamera} /> : null}

      {overriding ? (
        <SupervisorOverride
          onCancel={() => setOverriding(false)}
          onConfirmed={(supervisor, overrideReason) => decide({ kind: 'override', supervisorId: supervisor.id, reason: overrideReason })}
        />
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
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.xs,
  },
  field: {
    gap: space.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  card: {
    gap: space.md,
  },
  pair: {
    flexDirection: 'row',
    gap: space.sm,
  },
  half: {
    flex: 1,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.body,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    gap: space.sm,
    backgroundColor: colors.background,
  },
});
