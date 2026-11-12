import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { OptionTile, wideTiles } from '@/components/option-tile';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { HostField } from '@/host/host-field';
import { createInvite, inviteVisitTypes, loadSites, problemWords, type InviteSite } from '@/host/invites';
import { visitTypeOf } from '@/site/site-config';

const DAYS_AHEAD = 14;
const DAY_MS = 86_400_000;
const LENGTHS = [
  { days: 1, label: 'That day' },
  { days: 2, label: '2 days' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'A week' },
] as const;

const dayLabel = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric' });

function midnight(offset: number): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
}

/** A new invite: who, why, when, and anything that helps the guard. The ID number and plate are optional. */
export default function NewInvite() {
  const insets = useSafeAreaInsets();
  const [sites, setSites] = useState<InviteSite[] | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [visitType, setVisitType] = useState('visitor');
  const [day, setDay] = useState(0);
  const [length, setLength] = useState<number>(1);
  const [idNumber, setIdNumber] = useState('');
  const [plate, setPlate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadSites().then(
      (found) => {
        if (!live) return;
        setSites(found);
        if (found.length === 1 && found[0]) setSiteId(found[0].siteId);
      },
      (cause: unknown) => {
        if (live) setProblem(problemWords(cause));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const site = sites?.find((option) => option.siteId === siteId) ?? null;
  const types = site ? inviteVisitTypes(site.siteType) : [];
  const typesWide = wideTiles(types.map(({ label }) => label));
  const idOk = idNumber === '' || /^\d{13}$/.test(idNumber);
  const ready = site !== null && name.trim().length > 1 && idOk && !busy;

  const send = async () => {
    if (!site) return;
    setBusy(true);
    setProblem(null);
    const start = midnight(day);
    try {
      const created = await createInvite({
        siteId: site.siteId,
        name: name.trim(),
        idNumber,
        plate: plate.trim(),
        visitType,
        from: day === 0 ? Date.now() : start,
        until: start + length * DAY_MS - 1000,
        note: note.trim(),
      });
      router.replace({ pathname: '/host/[id]', params: { id: created.id } });
    } catch (cause) {
      setProblem(problemWords(cause));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="height" style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
        </View>
        <Text variant="display">Who&apos;s coming?</Text>

        {problem ? <ResultBanner compact tone="warning" title="Not sent" message={problem} /> : null}

        {sites && sites.length > 1 ? (
          <View style={styles.group}>
            <Text variant="overline" color={colors.inkMuted}>
              Where to
            </Text>
            <View style={styles.grid}>
              {sites.map((option) => (
                <OptionTile key={option.siteId} label={option.siteName} icon="on-site" tint="tileSky" selected={option.siteId === siteId} wide onPress={() => setSiteId(option.siteId)} />
              ))}
            </View>
          </View>
        ) : site ? (
          <Chip label={site.siteName} icon="on-site" />
        ) : null}

        <HostField label="Their name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="As on their ID" />

        {types.length > 0 ? (
          <View style={styles.group}>
            <Text variant="overline" color={colors.inkMuted}>
              Coming as
            </Text>
            <View style={styles.grid}>
              {types.map((type, index) => {
                const look = visitTypeOf(type.code);
                return (
                  <OptionTile
                    key={type.code}
                    label={type.label}
                    icon={look?.icon ?? 'visitor'}
                    tint={look?.tint ?? 'tileLilac'}
                    selected={type.code === visitType}
                    wide={typesWide[index] ?? true}
                    onPress={() => setVisitType(type.code)}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.group}>
          <Text variant="overline" color={colors.inkMuted}>
            When
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {Array.from({ length: DAYS_AHEAD }, (_unused, offset) => (
              <Chip
                key={offset}
                label={offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dayLabel.format(new Date(midnight(offset)))}
                tone={offset === day ? 'selected' : 'neutral'}
                onPress={() => setDay(offset)}
              />
            ))}
          </ScrollView>
          <View style={styles.chipRow}>
            {LENGTHS.map((option) => (
              <Chip key={option.days} label={option.label} tone={option.days === length ? 'selected' : 'neutral'} onPress={() => setLength(option.days)} />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text variant="overline" color={colors.inkMuted}>
            Helps the guard (optional)
          </Text>
          <HostField label="SA ID number" value={idNumber} onChangeText={(value) => setIdNumber(value.replace(/\D/g, '').slice(0, 13))} keyboardType="number-pad" hint={idOk ? 'Only the last four show on your list.' : 'An SA ID number is 13 digits.'} />
          <HostField label="Car's number plate" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
          <HostField label="Note for the guard" value={note} onChangeText={setNote} maxLength={120} placeholder="Parking at the back" hint="Never anything about a patient, a ward or someone's health." />
        </View>

        <PillButton label={busy ? 'Sending…' : 'Create the invite'} icon="check" disabled={!ready} onPress={() => void send()} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    justifyContent: 'center',
  },
  group: {
    gap: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chips: {
    gap: space.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
});
