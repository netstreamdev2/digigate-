import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { stepAway } from '@/shift/post-fence';
import { siteConfig } from '@/site/site-config';

export default function SteppingAwayScreen() {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = async (reason: string) => {
    setSaving(true);
    setProblem(null);
    try {
      await stepAway(reason, siteConfig.steppingAwayMinutes);
      router.back();
    } catch (cause) {
      setProblem(`That didn't save (${cause instanceof Error ? cause.message : 'unknown error'}). Try again.`);
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Back" tone="dark" onPress={() => router.back()} />
      </View>
      <View style={styles.copy}>
        <Text variant="overline" color={colors.inkMuted}>
          {`Back within ${siteConfig.steppingAwayMinutes} minutes`}
        </Text>
        <Text variant="display">Why are you stepping away?</Text>
        {problem ? <ResultBanner tone="warning" title="Not saved" message={problem} /> : null}
      </View>
      <View style={styles.actions}>
        {siteConfig.steppingAwayReasons.map((reason) => (
          <PillButton key={reason} label={reason} variant="secondary" disabled={saving} onPress={() => choose(reason)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space.lg,
    gap: space.xl,
    backgroundColor: colors.background,
  },
  topBar: {
    height: 56,
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: space.xs,
  },
  actions: {
    gap: space.sm,
  },
});
