import { colors, space } from '@digigate/design';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser, useSession } from '@/auth/session';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Logo } from '@/components/logo';
import { OptionTile } from '@/components/option-tile';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { currentPosts, shiftPeriodAt, siteConfig } from '@/site/site-config';
import { useShift } from '@/shift/shift-context';

export default function StartShiftScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const { signOut } = useSession();
  const { start, problem } = useShift();
  const [posts] = useState(currentPosts);
  const [post, setPost] = useState<string>(posts[0]?.code ?? '');
  const [period, setPeriod] = useState<string>(() => shiftPeriodAt(Date.now()).code);
  const [starting, setStarting] = useState(false);
  const [startProblem, setStartProblem] = useState<string | null>(null);

  const begin = async () => {
    setStarting(true);
    setStartProblem(null);
    try {
      await start(post, period);
    } catch (cause) {
      setStartProblem(`Your shift wasn't started (${cause instanceof Error ? cause.message : 'unknown error'}). Try the switch again.`);
      setStarting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <Logo height={26} />
        <Chip label={siteConfig.site} />
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

      <View style={styles.section}>
        <Text variant="overline" color={colors.inkMuted}>
          Your post
        </Text>
        <View style={styles.tiles} accessibilityRole="radiogroup">
          {posts.map((option) => (
            <OptionTile
              key={option.code}
              label={option.label}
              icon={option.icon}
              tint={option.tint}
              selected={option.code === post}
              onPress={() => setPost(option.code)}
              stacked
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="overline" color={colors.inkMuted}>
          Your shift
        </Text>
        <View style={styles.tiles} accessibilityRole="radiogroup">
          {siteConfig.shiftPeriods.map((option) => (
            <OptionTile
              key={option.code}
              label={option.label}
              detail={option.hours}
              icon={option.icon}
              tint={option.tint}
              selected={option.code === period}
              onPress={() => setPeriod(option.code)}
              stacked
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
          onValueChange={begin}
          disabled={starting}
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
