import { normaliseIdentifier, occupantTotal, type OccupantsBySex } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DocumentPreview } from '@/components/document-preview';
import { DiscPopup } from '@/components/disc-popup';
import { DocumentSheet } from '@/components/document-sheet';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PersonCard } from '@/components/person-card';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { ScanSteps } from '@/components/scan-steps';
import { Text } from '@/components/text';
import { VehicleCard } from '@/components/vehicle-card';
import { driverOnly, OccupantCounter } from '@/components/occupant-counter';
import { StayPicker } from '@/components/stay-picker';
import { VisitTypePicker } from '@/components/visit-type-picker';
import { useLocalDatabase } from '@/db/database-context';
import { masked, rememberLastScan, settleLastScan, visitTypeLabel } from '@/db/last-scan';
import { signalOutcome } from '@/lib/feedback';
import { titleCase } from '@/lib/format';
import { vehicleGateWords } from '@/lib/gate-words';
import { expectedStayFor, launchGraceEndsAt, siteConfig, visitTypeOf } from '@/site/site-config';
import { usePost } from '@/shift/shift-context';
import { useSync } from '@/sync/sync-context';

import { PlateCamera } from './plate-camera';
import { PlateField } from './plate-field';
import { SupervisorOverride } from './supervisor-override';
import { useCarPark } from './use-car-park';
import { useKeepLicencePhoto } from './use-keep-licence-photo';
import { useKeepPlatePhoto } from './use-keep-plate-photo';
import { usePlateEntry } from './use-plate-entry';
import { useVehicleDocuments } from './use-vehicle-documents';
import { recordDecision, recordOccupantReason, type Decision, type Direction } from './decision';
import { OccupantReasonCard } from './occupant-reason-card';
import { CheckResult, type Settled } from './check-result';
import { completedExitChecks, ExitChecksCard, NO_EXIT_CHECKS, type ExitChecks } from './exit-checks';
import { ExpectedCard } from './expected-card';
import { useInvite } from './use-invite';
import { checkVehicle, scannedSubject, type CheckedVehicle, type Passage } from './vehicle-check';

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
  const carPark = useCarPark();
  const [checked, setChecked] = useState<CheckedVehicle | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [details, setDetails] = useState<'licence' | 'disc' | 'disc-drawing' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const plate = usePlateEntry();
  const [people, setPeople] = useState<OccupantsBySex>(driverOnly(null));
  const peopleCounted = useRef(false);
  const [visitType, setVisitType] = useState<string>(siteConfig.defaultVisitType);
  const [stay, setStay] = useState<number | null>(expectedStayFor(siteConfig.defaultVisitType));
  const [exitChecks, setExitChecks] = useState<ExitChecks>(NO_EXIT_CHECKS);
  const documents = useVehicleDocuments(checked === null);
  const { disc, licence, photo, notice } = documents;
  const invite = useInvite(db, documents.inviteCode, direction);
  const invitedBooking = invite?.kind === 'expected' ? invite.booking : null;
  const photoProblem = useKeepLicencePhoto(db, checked?.event ?? null, photo);
  const platePhotoProblem = useKeepPlatePhoto(db, checked?.event ?? null, plate.photo);
  const copy = COPY[direction];
  const words = vehicleGateWords(post.hasBoom);
  // Read once per screen: the note only says when the grace ends, the rule itself checks the time of each scan.
  const [graceEnds] = useState(() => launchGraceEndsAt(Date.now()));
  const occupants = occupantTotal(people);

  // The driver counts as the licence says, until the guard counts the car themselves.
  const driverGender = licence?.gender ?? null;
  useEffect(() => {
    if (!peopleCounted.current) setPeople(driverOnly(driverGender));
  }, [driverGender]);

  const countPeople = (next: OccupantsBySex) => {
    peopleCounted.current = true;
    setPeople(next);
  };

  const chooseVisitType = (code: string) => {
    setVisitType(code);
    setStay(expectedStayFor(code));
  };

  // The host said why they're coming; the guard can still change it.
  const invitedVisitType = invitedBooking?.visitType ?? null;
  useEffect(() => {
    if (!invitedVisitType || !visitTypeOf(invitedVisitType)) return;
    setVisitType(invitedVisitType);
    setStay(expectedStayFor(invitedVisitType));
  }, [invitedVisitType]);

  const completedChecks = completedExitChecks(exitChecks);
  const passage: Passage | null = direction === 'entry' ? { direction } : completedChecks && { direction, ...completedChecks };
  const ready = disc !== null && licence !== null && passage !== null && plate.normalised.length >= MIN_PLATE_LENGTH;
  // Checked before the rules run, without showing the disc's plate: a slip is fixed at the gate, not left as an alert.
  const plateDiffers = disc !== null && plate.normalised !== normaliseIdentifier(disc.plate);
  const lookAgain = !checked && plateDiffers && plate.warnedPlate !== null;

  const runCheck = async () => {
    if (!disc || !licence || !passage) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await checkVehicle(db, {
        ...passage,
        subject: scannedSubject({ disc, licence }),
        typedPlate: plate.plate,
        plateEntry: plate.payload(),
        occupants,
        occupantsBySex: people,
        visitType,
        expectedStayMinutes: stay,
        guardId: guard.id,
        invitedBooking,
      });
      setChecked(result);
      signalOutcome(result.outcome);
      eventRecorded();
      rememberLastScan(db, {
        gateUserId: guard.id,
        at: result.event.occurredAt,
        direction: direction === 'entry' ? 'in' : 'out',
        name: `${licence.initials} ${titleCase(licence.surname)}`,
        visitType: visitTypeLabel(result.event.payload.visit_type, (code) => visitTypeOf(code)?.label ?? null),
        outcome: result.outcome,
        settled: null,
        plate: masked(normaliseIdentifier(disc.plate)),
        vehicle: `${disc.make} ${disc.model}`,
        people: occupants,
        idNumber: masked(licence.idNumber),
      });
    } catch (cause) {
      setProblem(`Nothing was recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Press Check again.`);
    } finally {
      setBusy(false);
    }
  };

  // The first Check with a plate that isn't the disc's asks the guard to look again; the second goes ahead.
  const check = () => {
    if (plateDiffers && plate.warnedPlate === null) {
      plate.warn();
      return;
    }
    void runCheck();
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

  const nextCar = () => {
    documents.reset();
    setChecked(null);
    setSettled(null);
    setDetails(null);
    setProblem(null);
    plate.reset();
    peopleCounted.current = false;
    setPeople(driverOnly(null));
    setVisitType(siteConfig.defaultVisitType);
    setStay(expectedStayFor(siteConfig.defaultVisitType));
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
            hotlistNotes={checked.hotlistNotes}
            expected={checked.expected}
            settled={settled}
            clearMessage={
              direction === 'entry'
                ? `No flags on this car or driver. ${words.letIn} The visit has started.`
                : `This driver brought this car in. ${words.letOut} The visit has ended.`
            }
            letThroughMessage={direction === 'entry' ? `${words.letIn} The visit has started.` : `${words.letOut} The visit has ended.`}
            words={words}
          />
        ) : (
          <View style={styles.heading}>
            <Text variant="overline" color={colors.inkMuted}>
              {copy.overline}
            </Text>
            <Text variant="display">{copy.title}</Text>
          </View>
        )}

        {checked && checked.occupantsCameIn !== null ? (
          <OccupantReasonCard
            cameIn={checked.occupantsCameIn}
            leaving={occupants}
            onReason={(change, reason) => recordOccupantReason(db, checked, change, reason, guard.id).then(eventRecorded)}
          />
        ) : null}

        {problem ? <ResultBanner tone="warning" title="Not saved" message={problem} /> : null}
        {photoProblem ? <ResultBanner tone="warning" title="Photo not kept" message={photoProblem} /> : null}
        {platePhotoProblem ? <ResultBanner tone="warning" title="Plate photo not kept" message={platePhotoProblem} /> : null}
        {notice && !checked ? <ResultBanner tone="warning" title={notice.title} message={notice.message} /> : null}
        {invite?.kind === 'refused' && !checked ? <ResultBanner tone="warning" title={invite.title} message={invite.message} /> : null}
        {invitedBooking && !checked ? <ExpectedCard booking={invitedBooking} next="Invite valid. Scan the disc and their licence, and check the name matches." /> : null}
        {direction === 'exit' && !checked && graceEnds !== null ? (
          <View style={styles.graceNote}>
            <Icon name="info" size={20} color={colors.brand} />
            <Text variant="label" color={colors.inkMuted} style={styles.graceCopy}>
              {`Launch week until ${new Date(graceEnds).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}: a car with no DigiGate entry is asked about, not stopped. Everything else is checked as normal.`}
            </Text>
          </View>
        ) : null}
        {direction === 'entry' && !checked && carPark.kind === 'counted' && carPark.full ? (
          <ResultBanner
            tone="warning"
            title="Car park full"
            message={`All ${carPark.spaces} spaces are taken. Scan as normal: deliveries, drop-offs and emergencies still go in. Ask anyone looking for parking to wait or park outside.`}
          />
        ) : null}

        {licence ? <PersonCard document={{ kind: 'driver-licence', licence, photo }} onOpen={() => setDetails('licence')} /> : null}

        {/* The disc's plate stays back until the check, in its details and its drawing alike (see the plate input below). */}
        {disc ? <VehicleCard disc={disc} onOpen={() => setDetails('disc')} onShowDisc={() => setDetails('disc-drawing')} /> : null}

        <ScanSteps
          steps={[
            {
              key: 'disc',
              icon: 'licence-disc',
              tint: 'tileSky',
              title: 'Licence disc',
              instruction: 'Aim at the barcode on the disc',
              where: 'Inside the windscreen',
              done: disc !== null,
            },
            {
              key: 'licence',
              icon: 'licence-card',
              tint: 'tileLilac',
              title: "Driver's licence",
              instruction: 'Aim at the barcode on the back',
              where: 'Ask the driver to hand it to you',
              done: licence !== null,
            },
          ]}
        />

        <Card style={styles.plate}>
          <PlateField entry={plate} checked={checked !== null} discPlate={checked && disc ? disc.plate : null} lookAgain={lookAgain} />
        </Card>

        <OccupantCounter title={copy.people} value={people} onChange={countPeople} locked={checked !== null} />

        {direction === 'entry' ? (
          <>
            <VisitTypePicker value={visitType} onChange={chooseVisitType} locked={checked !== null} />
            <StayPicker value={stay} onChange={setStay} locked={checked !== null} />
          </>
        ) : (
          <ExitChecksCard value={exitChecks} onChange={setExitChecks} locked={checked !== null} />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {!checked ? (
          <PillButton label={lookAgain ? "It's right · Check" : "Check"} icon="check" disabled={!ready || busy} onPress={check} />
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
          <DocumentPreview decoded={{ kind: 'licence-disc', disc }} photo={null} plateHidden={!checked} />
        </DocumentSheet>
      ) : null}

      {details === 'disc-drawing' && disc ? <DiscPopup disc={disc} plateShown={checked !== null} onClose={() => setDetails(null)} /> : null}

      {plate.cameraOpen ? <PlateCamera onUse={plate.acceptPhoto} onType={plate.typeIt} onCancel={plate.closeCamera} /> : null}

      {overriding ? (
        <SupervisorOverride
          onCancel={() => setOverriding(false)}
          onConfirmed={(supervisor, reason) => decide({ kind: 'override', supervisorId: supervisor.id, reason })}
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
  graceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.tileSky,
  },
  graceCopy: {
    flex: 1,
  },
  heading: {
    gap: space.xs,
  },
  plate: {
    gap: space.xs,
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
