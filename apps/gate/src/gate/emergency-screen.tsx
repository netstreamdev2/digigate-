import { OTHER_EMERGENCY, type EmergencyKind, type GateEvent } from '@digigate/core';
import { colors, radius, space, typography } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/session';
import type { GateUser } from '@/auth/users';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { OptionTile, wideTiles } from '@/components/option-tile';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { useLocalDatabase } from '@/db/database-context';
import { signalOutcome } from '@/lib/feedback';
import { formatPlate } from '@/lib/format';
import { vehicleGateWords } from '@/lib/gate-words';
import { emergencyKinds } from '@/site/site-config';
import { usePost } from '@/shift/shift-context';
import { useSync } from '@/sync/sync-context';

import { emergenciesOnSite, emergencyName, letEmergencyIn, letEmergencyOut, type EmergencyOnSite } from './emergency-check';
import { PlateCamera } from './plate-camera';
import { PlateField } from './plate-field';
import { useKeepPlatePhoto } from './use-keep-plate-photo';
import { usePlateEntry } from './use-plate-entry';

const FOOTER_HEIGHT = 96;

const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

export function EmergencyScreen() {
  const user = useCurrentUser();
  return user ? <Emergency guard={user} /> : null;
}

type Done = { title: string; message: string; event: GateEvent | null };

/**
 * An emergency vehicle, let in first and recorded after: what kind, and the plate if there's time. Nothing here can
 * hold the boom. Emergency vehicles on site are listed below, to let out with one tap.
 */
function Emergency({ guard }: { guard: GateUser }) {
  const insets = useSafeAreaInsets();
  const { db } = useLocalDatabase();
  const { eventRecorded } = useSync();
  const post = usePost();
  const words = vehicleGateWords(post.hasBoom);
  const kinds = emergencyKinds();
  const wide = wideTiles(kinds.map(({ label }) => label));
  const [kind, setKind] = useState<EmergencyKind | null>(null);
  const [note, setNote] = useState('');
  const [onSite, setOnSite] = useState<EmergencyOnSite[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const plate = usePlateEntry();
  const platePhotoProblem = useKeepPlatePhoto(db, done?.event ?? null, plate.photo);

  useEffect(() => {
    let current = true;
    emergenciesOnSite(db, Date.now()).then(
      (vehicles) => {
        if (current) setOnSite(vehicles);
      },
      (cause: unknown) => {
        if (current) setProblem(`The emergency vehicles on site couldn't be read (${cause instanceof Error ? cause.message : 'unknown error'}).`);
      },
    );
    return () => {
      current = false;
    };
  }, [db, done]);

  const letIn = async () => {
    if (!kind) return;
    setBusy(true);
    setProblem(null);
    try {
      const typedNote = kind.code === OTHER_EMERGENCY ? note.trim() || null : null;
      const event = await letEmergencyIn(db, { kind, note: typedNote, plate: plate.normalised, plateEntry: plate.payload(), guardId: guard.id });
      signalOutcome('clear');
      eventRecorded();
      setDone({ title: 'Let them in', message: `${words.letIn} ${emergencyName(kind, typedNote)} is on record, and the control room has been told.`, event });
    } catch (cause) {
      setProblem(`Nothing was recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Let them in anyway, then press Let them in again.`);
    } finally {
      setBusy(false);
    }
  };

  const letOut = async (vehicle: EmergencyOnSite) => {
    setBusy(true);
    setProblem(null);
    try {
      await letEmergencyOut(db, vehicle, guard.id);
      signalOutcome('clear');
      eventRecorded();
      setDone({ title: 'Let them out', message: `${words.letOut} ${vehicle.name} is on record as gone.`, event: null });
    } catch (cause) {
      setProblem(`That wasn't recorded (${cause instanceof Error ? cause.message : 'unknown error'}). Let them out anyway, then try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_HEIGHT }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label={`${post.label} · Emergency`} icon="emergency" />
        </View>

        {done ? (
          <ResultBanner tone="clear" title={done.title} message={done.message} />
        ) : (
          <View style={styles.heading}>
            <Text variant="overline" color={colors.inkMuted}>
              Emergency · let them in first
            </Text>
            <Text variant="display">What kind?</Text>
          </View>
        )}

        {problem ? <ResultBanner tone="warning" title="Not saved" message={problem} /> : null}
        {platePhotoProblem ? <ResultBanner tone="warning" title="Plate photo not kept" message={platePhotoProblem} /> : null}

        {done ? null : (
          <>
            <View style={styles.grid} accessibilityRole="radiogroup">
              {kinds.map((option, index) => (
                <OptionTile
                  key={option.code}
                  label={option.label}
                  icon={option.code === OTHER_EMERGENCY ? 'manual-entry' : 'emergency'}
                  tint="blockedSoft"
                  selected={kind?.code === option.code}
                  wide={wide[index] ?? true}
                  onPress={() => setKind(option)}
                />
              ))}
            </View>

            {kind?.code === OTHER_EMERGENCY ? (
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="What is it? A word or two"
                placeholderTextColor={colors.inkSubtle}
                maxLength={40}
                style={styles.input}
                accessibilityLabel="What kind of emergency"
              />
            ) : null}

            {kind ? (
              <Card style={styles.plate}>
                <Text variant="label" color={colors.inkMuted}>
                  The plate, if there's time. It never holds them up.
                </Text>
                <PlateField entry={plate} checked={false} discPlate={null} lookAgain={false} />
              </Card>
            ) : null}
          </>
        )}

        {onSite.length > 0 ? (
          <View style={styles.leaving}>
            <Text variant="overline" color={colors.inkMuted}>
              Emergency vehicles on site
            </Text>
            {onSite.map((vehicle) => (
              <Card key={vehicle.visitId} style={styles.vehicle}>
                <View style={styles.vehicleCopy}>
                  <Text variant="bodyStrong">{vehicle.name}</Text>
                  <Text variant="label" color={colors.inkMuted}>
                    {[vehicle.plate ? formatPlate(vehicle.plate) : 'No plate taken', `in at ${timeOf(vehicle.enteredAt)}`].join(' · ')}
                  </Text>
                </View>
                <PillButton label="Let out" icon="exit" variant="secondary" disabled={busy} onPress={() => void letOut(vehicle)} />
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {done ? (
          <PillButton label="Done" icon="check" onPress={() => router.back()} />
        ) : (
          <PillButton label="Let them in" icon="entry" disabled={!kind || busy} onPress={() => void letIn()} />
        )}
      </View>

      {plate.cameraOpen ? <PlateCamera onUse={plate.acceptPhoto} onType={plate.typeIt} onCancel={plate.closeCamera} /> : null}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.body,
  },
  plate: {
    gap: space.xs,
  },
  leaving: {
    gap: space.sm,
  },
  vehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  vehicleCopy: {
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
    backgroundColor: colors.background,
  },
});
