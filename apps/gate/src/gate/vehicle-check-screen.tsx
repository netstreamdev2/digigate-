import { normaliseIdentifier } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { KeyboardScroll, useKeyboardHeight } from '@/components/keyboard-scroll';
import { PersonCard } from '@/components/person-card';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { ScanSteps } from '@/components/scan-steps';
import { Text } from '@/components/text';
import { VehicleCard } from '@/components/vehicle-card';
import { PeopleCounter } from '@/components/people-counter';
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

import { SupervisorOverride } from './supervisor-override';
import { useCarPark } from './use-car-park';
import { useKeepLicencePhoto } from './use-keep-licence-photo';
import { useVehicleDocuments } from './use-vehicle-documents';
import { recordDecision, recordOccupantReason, type Decision, type Direction } from './decision';
import { OccupantReasonCard } from './occupant-reason-card';
import { CheckResult, type Settled } from './check-result';
import { completedExitChecks, ExitChecksCard, NO_EXIT_CHECKS, type ExitChecks } from './exit-checks';
import { ExpectedCard } from './expected-card';
import { EMERGENCY_VISIT, emergencyName, emergencyPayload, type EmergencyChoice } from './emergency';
import { EmergencySheet } from './emergency-sheet';
import { useInvite } from './use-invite';
import { checkVehicle, scannedSubject, type CheckedVehicle, type Passage } from './vehicle-check';

const FOOTER_HEIGHT = 160;

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
  const keyboardHeight = useKeyboardHeight();
  // The footer is pinned over the bottom of the screen, so a field scrolled into view must clear it too.
  const [footerHeight, setFooterHeight] = useState(0);
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
  // How many people are in the car, the driver included.
  const [occupants, setOccupants] = useState(1);
  const [visitType, setVisitType] = useState<string>(siteConfig.defaultVisitType);
  const [stay, setStay] = useState<number | null>(expectedStayFor(siteConfig.defaultVisitType));
  const [exitChecks, setExitChecks] = useState<ExitChecks>(NO_EXIT_CHECKS);
  const [emergency, setEmergency] = useState<EmergencyChoice | null>(null);
  const [choosingEmergency, setChoosingEmergency] = useState(false);
  const documents = useVehicleDocuments(checked === null);
  const { disc, licence, photo, notice } = documents;
  const invite = useInvite(db, documents.inviteCode, direction);
  const invitedBooking = invite?.kind === 'expected' ? invite.booking : null;
  const photoProblem = useKeepLicencePhoto(db, checked?.event ?? null, photo);
  const copy = COPY[direction];
  const words = vehicleGateWords(post.hasBoom);
  // Read once per screen: the note only says when the grace ends, the rule itself checks the time of each scan.
  const [graceEnds] = useState(() => launchGraceEndsAt(Date.now()));

  const chooseVisitType = (code: string) => {
    // An emergency asks what kind first; the check still needs the disc and the licence.
    if (code === EMERGENCY_VISIT) {
      setChoosingEmergency(true);
      return;
    }
    setEmergency(null);
    setVisitType(code);
    setStay(expectedStayFor(code));
  };

  const chooseEmergency = (choice: EmergencyChoice) => {
    setChoosingEmergency(false);
    setEmergency(choice);
    setVisitType(EMERGENCY_VISIT);
    setStay(expectedStayFor(EMERGENCY_VISIT));
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
  // The disc and the licence are all a scanned car needs: the disc carries the plate (13 November: typing or
  // photographing it held up the queue).
  const ready = disc !== null && licence !== null && passage !== null;

  const runCheck = async () => {
    if (!disc || !licence || !passage) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await checkVehicle(db, {
        ...passage,
        subject: scannedSubject({ disc, licence }),
        typedPlate: disc.plate,
        plateEntry: { source: 'disc' },
        occupants,
        occupantsBySex: null,
        visitType,
        expectedStayMinutes: stay,
        guardId: guard.id,
        invitedBooking,
        emergency: emergency ? emergencyPayload(emergency) : null,
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

  const check = () => void runCheck();

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
    setOccupants(1);
    setVisitType(siteConfig.defaultVisitType);
    setStay(expectedStayFor(siteConfig.defaultVisitType));
    setExitChecks(NO_EXIT_CHECKS);
    setEmergency(null);
  };

  const finished = checked !== null && (checked.outcome === 'clear' || settled !== null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* While the keyboard is up, the screen and its footer end at the keyboard's top. */}
      <KeyboardScroll
        style={{ marginBottom: keyboardHeight }}
        coveredBelow={footerHeight}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_HEIGHT }]}
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
        {notice && !checked ? <ResultBanner tone="warning" title={notice.title} message={notice.message} /> : null}
        {emergency && !checked ? (
          <ResultBanner
            tone="warning"
            title={emergencyName(emergency)}
            message={`Ask them to wait a moment: scan the disc and the driver's licence, then press Check. ${words.letIn.replace(/\.$/, '')} once it's done.`}
          />
        ) : null}
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

        <PeopleCounter title={copy.people} value={occupants} onChange={setOccupants} locked={checked !== null} />

        {direction === 'entry' ? (
          <>
            <VisitTypePicker value={visitType} onChange={chooseVisitType} locked={checked !== null} />
            <StayPicker value={stay} onChange={setStay} locked={checked !== null} />
          </>
        ) : (
          <ExitChecksCard value={exitChecks} onChange={setExitChecks} locked={checked !== null} />
        )}
      </KeyboardScroll>

      <View
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        style={[styles.footer, { bottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? space.sm : insets.bottom + space.md }]}>
        {!checked ? (
          <PillButton label="Check" icon="check" disabled={!ready || busy} onPress={check} />
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


      {choosingEmergency ? <EmergencySheet onChoose={chooseEmergency} onCancel={() => setChoosingEmergency(false)} /> : null}

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
