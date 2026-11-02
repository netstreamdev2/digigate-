import { englishPart, isExpired, type ParsedLicenceDisc } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate } from '@/lib/format';
import { siteConfig } from '@/site/site-config';

import { Card } from './card';
import { Chip } from './chip';
import { Icon } from './icon';
import { Text } from './text';
import { vehicleArtFor } from './vehicle-art';

/**
 * The car behind a scanned disc: its body shape, and the make, model and colour in the disc's own words for the guard
 * to check against the car. The plate is left out so the guard reads it off the car. Tapping it opens every detail on
 * the disc, and the round disc button draws the disc itself.
 */
export function VehicleCard({ disc, onOpen, onShowDisc }: { disc: ParsedLicenceDisc; onOpen?: () => void; onShowDisc?: () => void }) {
  const art = vehicleArtFor(disc.description);
  const expired = isExpired(disc.expiresOn, Date.now(), siteConfig.rules.utcOffsetMinutes);
  const name = `${disc.make} ${disc.model}`;

  const card = (pressed: boolean) => (
    <Card style={[styles.card, pressed && styles.pressed]}>
      <View style={styles.top}>
        {art ? (
          <View style={styles.art}>
            <Image source={art} style={styles.artImage} contentFit="contain" accessibilityLabel={englishPart(disc.description)} />
          </View>
        ) : (
          <View style={styles.icon}>
            <Icon name="vehicle" size={40} color={colors.brand} />
          </View>
        )}
        <View style={styles.identity}>
          <Text variant="overline" color={colors.inkMuted}>
            Licence disc
          </Text>
          <Text variant="title" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="bodyStrong" color={colors.inkMuted}>
            {`${englishPart(disc.colour)} · ${englishPart(disc.description)}`}
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chips}>
          {expired ? (
            <Chip label="Disc expired" tone="blocked" icon="result-blocked" />
          ) : (
            <Chip label={`Valid to ${formatDate(disc.expiresOn)}`} tone="clear" icon="check" />
          )}
        </View>
        {onShowDisc ? (
          <Pressable
            onPress={onShowDisc}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Show the disc"
            style={({ pressed }) => [styles.discButton, pressed && styles.discButtonPressed]}>
            <Icon name="licence-disc" size={24} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.compare}>
        <Icon name="info" size={20} color={colors.brand} />
        <Text variant="label" style={styles.compareCopy}>
          {art
            ? 'Check the make, model and colour against the car. The drawing shows the body shape only.'
            : 'Check the make, model and colour against the car.'}
        </Text>
      </View>

      {onOpen ? (
        <View style={styles.more}>
          <Text variant="bodyStrong">All details</Text>
          <View style={styles.chevron}>
            <Icon name="back" size={20} color={colors.ink} />
          </View>
        </View>
      ) : null}
    </Card>
  );

  return onOpen ? (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${name}. Show all details`}>
      {({ pressed }) => card(pressed)}
    </Pressable>
  ) : (
    card(false)
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  // The drawings are 480 by 300 pixels; this keeps their 8:5 shape.
  art: {
    width: 128,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  icon: {
    paddingHorizontal: space.xxs,
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: space.xxs,
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  discButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.tileSky,
    backgroundColor: colors.surface,
  },
  discButtonPressed: {
    backgroundColor: colors.tileSky,
  },
  compare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.tileSky,
  },
  compareCopy: {
    flex: 1,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  // The back arrow, turned to point forward.
  chevron: {
    transform: [{ rotate: '180deg' }],
  },
});
