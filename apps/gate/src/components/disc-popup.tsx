import type { ParsedLicenceDisc } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DiscDrawing } from './disc-drawing';
import { IconButton } from './icon-button';
import { PillButton } from './pill-button';
import { Text } from './text';

const MOST_DISC_SIZE = 340;

/** The disc drawn large over the current screen. Opens instantly, like every sheet in the gate app. */
export function DiscPopup({ disc, plateShown, onClose }: { disc: ParsedLicenceDisc; plateShown: boolean; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - space.lg * 4, MOST_DISC_SIZE);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the disc" />
      <View style={styles.card}>
        <View style={styles.top}>
          <View style={styles.titles}>
            <Text variant="overline" color={colors.inkMuted}>
              Licence disc
            </Text>
            <Text variant="heading">{`${disc.make} ${disc.model}`}</Text>
          </View>
          <IconButton icon="close" label="Close the disc" onPress={onClose} />
        </View>
        <View style={styles.drawing}>
          <DiscDrawing disc={disc} plateShown={plateShown} size={size} />
        </View>
        <Text variant="label" color={colors.inkMuted}>
          {plateShown
            ? "Drawn from the disc's barcode. Hold it up to the disc on the windscreen: every detail should match."
            : "Drawn from the disc's barcode. The plate shows after the check, so you read it off the car."}
        </Text>
        <PillButton label="Close" variant="secondary" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.ink,
    opacity: 0.55,
  },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  drawing: {
    alignItems: 'center',
  },
});
