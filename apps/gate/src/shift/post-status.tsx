import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { useShift } from '@/shift/shift-context';
import { fenceOf } from '@/site/site-config';

import { backAtPost, type FenceProblem } from './post-fence';
import { useFenceStatus } from './post-warning';

const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

const PROBLEM_WORDS: Record<FenceProblem, string> = {
  'no-permission': "DigiGate isn't allowed to use this device's location. Tell your supervisor.",
  'location-off': 'Location is switched off on this device. Turn it on, then come back to this screen.',
};

/**
 * Shown on home while on duty. At an access point with a location: the way to say you're stepping away, and to say
 * you're back. At one without: that leaving it isn't checked, and the way to set where it is, so a gap in the setup is
 * never silent.
 */
export function PostStatus() {
  const { watching, awayUntil, problem } = useFenceStatus();
  const { shift } = useShift();
  const [notSaved, setNotSaved] = useState(false);

  if (problem) return <ResultBanner tone="warning" title="Your access point isn't being checked" message={PROBLEM_WORDS[problem]} />;
  if (shift && !fenceOf(shift.post)) {
    return (
      <View style={styles.row}>
        <Text variant="label" color={colors.inkMuted} style={styles.note}>
          Leaving this access point isn't checked: it has no location yet.
        </Text>
        <Chip label="Set its location" icon="on-site" onPress={() => router.push('/set-location')} />
      </View>
    );
  }
  if (!watching) return null;

  const back = async () => {
    try {
      await backAtPost();
      setNotSaved(false);
    } catch {
      setNotSaved(true);
    }
  };

  return (
    <View style={styles.row}>
      {notSaved ? <ResultBanner tone="warning" title="Not saved" message="That didn't save on this device. Tap I'm back again." /> : null}
      {awayUntil ? (
        <>
          <Chip label={`Away, back by ${timeOf(awayUntil)}`} icon="duration" />
          <Chip label="I'm back" icon="check" tone="selected" onPress={back} />
        </>
      ) : (
        <Chip label="Stepping away" icon="exit" onPress={() => router.push('/stepping-away')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  note: {
    flexBasis: '100%',
  },
});
