import { colors, space } from '@digigate/design';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser, useSession } from '@/auth/session';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Logo } from '@/components/logo';
import { OptionTile, wideTiles } from '@/components/option-tile';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { useLocalDatabase } from '@/db/database-context';
import { dutyElsewhereFor, type DutyElsewhere } from '@/db/duty-elsewhere';
import type { ShiftMove, ShiftPhoto } from '@/db/shifts';
import { SupervisorOverride } from '@/gate/supervisor-override';
import { currentPosts, currentShiftPeriods, shiftPeriodAt, siteConfig, siteName } from '@/site/site-config';
import { useShift } from '@/shift/shift-context';

const HOUR_MS = 60 * 60_000;
// A shift starts without a photo (13 November: the selfie held guards up at the start of a shift).
const NO_SELFIE: ShiftPhoto = { status: 'skipped' };

/** Where and since when, in a guard's words: "Back Gate, Durban Hospital on DT50-2 since 06:00". */
function whereOnDuty(duty: DutyElsewhere): string {
  const since = new Date(duty.since);
  const today = since.toDateString() === new Date().toDateString();
  const time = since.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const when = today ? time : `${since.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}, ${time}`;
  return `${duty.post}${duty.site ? `, ${duty.site}` : ''} on ${duty.device ?? 'another handheld'} since ${when}`;
}

export default function StartShiftScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const { signOut } = useSession();
  const { start, problem } = useShift();
  const { db } = useLocalDatabase();
  // One guard, one handheld: a guard already on duty elsewhere can't start here unless a supervisor moves the shift.
  const [elsewhere, setElsewhere] = useState<DutyElsewhere | null>(null);
  const [move, setMove] = useState<ShiftMove | null>(null);
  const [approving, setApproving] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    dutyElsewhereFor(db, userId, Date.now(), siteConfig.maxShiftHours * HOUR_MS).then(
      (duty) => {
        if (!cancelled) setElsewhere(duty);
      },
      () => {
        // The list couldn't be read. The shift can still start, and the server flags a guard on two handhelds.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, userId]);
  const blocked = elsewhere !== null && move === null;
  const [posts] = useState(currentPosts);
  const [post, setPost] = useState<string>(posts[0]?.code ?? '');
  const [periods] = useState(currentShiftPeriods);
  const postWide = wideTiles(posts.map((option) => option.label));
  const periodWide = wideTiles(periods.map((option) => option.label));
  const [period, setPeriod] = useState<string>(() => shiftPeriodAt(Date.now())?.code ?? '');
  const [starting, setStarting] = useState(false);
  const [startProblem, setStartProblem] = useState<string | null>(null);

  const begin = async (photo: ShiftPhoto) => {
    setStarting(true);
    setStartProblem(null);
    try {
      await start(post, period, photo, move);
    } catch (cause) {
      setStartProblem(`Your shift wasn't started (${cause instanceof Error ? cause.message : 'unknown error'}). Try the switch again.`);
      setStarting(false);
    }
  };

  if (approving && elsewhere) {
    return (
      <SupervisorOverride
        chip="Move shift"
        fixedReason="Move the shift to this handheld"
        notSupervisorMessage="Only a supervisor can move a guard's shift. Call one to the gate."
        onCancel={() => setApproving(false)}
        onConfirmed={(supervisor) => {
          setApproving(false);
          setMove({ fromShiftId: elsewhere.shiftId, bySupervisorId: supervisor.id });
        }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <Logo height={26} />
        <Chip label={siteName()} />
      </View>

      <View style={styles.heading}>
        <Text variant="overline" color={colors.inkMuted}>
          Start your shift
        </Text>
        <Text variant="display">{user ? `Hi ${user.firstName}` : ' '}</Text>
      </View>

      {problem ? (
        <ResultBanner tone="warning" title="Shift record not read" message="DigiGate couldn't check who was on duty. Start your shift, and tell your supervisor." />
      ) : null}
      {startProblem ? <ResultBanner tone="warning" title="Not started" message={startProblem} /> : null}
      {blocked && elsewhere && user ? (
        <>
          <ResultBanner
            tone="blocked"
            title="Already on duty"
            message={`${user.firstName} is on duty at ${whereOnDuty(elsewhere)}. A guard can only be on duty on one handheld: end the shift there, or ask a supervisor to move it here.`}
          />
          <PillButton label="Move my shift here" icon="supervisor" onPress={() => setApproving(true)} />
        </>
      ) : null}
      {move ? (
        <ResultBanner tone="clear" title="Shift will move here" message="A supervisor approved it. The other handheld signs you out at its next sync." />
      ) : null}

      <View style={styles.section}>
        <Text variant="overline" color={colors.inkMuted}>
          Your access point
        </Text>
        <View style={styles.tiles} accessibilityRole="radiogroup">
          {posts.map((option, index) => (
            <OptionTile
              key={option.code}
              label={option.label}
              icon={option.icon}
              tint={option.tint}
              selected={option.code === post}
              onPress={() => setPost(option.code)}
              stacked
              wide={postWide[index]}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="overline" color={colors.inkMuted}>
          Your shift
        </Text>
        <View style={styles.tiles} accessibilityRole="radiogroup">
          {periods.map((option, index) => (
            <OptionTile
              key={option.code}
              label={option.label}
              detail={option.hours}
              icon={option.icon}
              tint={option.tint}
              selected={option.code === period}
              onPress={() => setPeriod(option.code)}
              stacked
              wide={periodWide[index]}
            />
          ))}
        </View>
      </View>

      <Card style={styles.start}>
        <View style={styles.startCopy}>
          <Text variant="bodyStrong">Start my shift</Text>
          <Text variant="label" color={colors.inkMuted}>
            You're on duty from now. Every gate record until you end it is yours.
          </Text>
        </View>
        <Switch
          value={starting}
          onValueChange={() => void begin(NO_SELFIE)}
          disabled={starting || blocked}
          trackColor={{ false: colors.border, true: colors.clear }}
          thumbColor={colors.surface}
          accessibilityLabel="Start my shift"
        />
      </Card>

      <PillButton label="Not you? Switch guard" variant="secondary" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
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
  section: {
    gap: space.sm,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  startCopy: {
    flex: 1,
    gap: 2,
  },
});
