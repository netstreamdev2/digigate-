import { englishPart, isExpired, vehicleBodyFromDisc, type ParsedLicenceDisc, type VehicleBody } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate } from '@/lib/format';
import { siteConfig } from '@/site/site-config';

import { Card } from './card';
import { Chip } from './chip';
import { Icon } from './icon';
import { Text } from './text';

// Neutral grey drawings of the body shape only. A drawing of a specific model or paint colour that the car doesn't
// quite match (an older Hilux, an orange that comes out red) could make a guard think a genuine car is stolen.
const BODY_ART: Record<VehicleBody, number> = {
  hatchback: require('@digigate/design/vehicles/generic-hatchback-neutral.webp'),
  sedan: require('@digigate/design/vehicles/generic-sedan-neutral.webp'),
  'suv-small': require('@digigate/design/vehicles/generic-suv-small-neutral.webp'),
  'suv-large': require('@digigate/design/vehicles/generic-suv-large-neutral.webp'),
  mpv: require('@digigate/design/vehicles/generic-mpv-neutral.webp'),
  'bakkie-single-cab': require('@digigate/design/vehicles/generic-bakkie-single-cab-neutral.webp'),
  'bakkie-double-cab': require('@digigate/design/vehicles/generic-bakkie-double-cab-neutral.webp'),
  minibus: require('@digigate/design/vehicles/generic-minibus-neutral.webp'),
  'panel-van': require('@digigate/design/vehicles/generic-panel-van-neutral.webp'),
  'truck-light': require('@digigate/design/vehicles/generic-truck-light-neutral.webp'),
  'truck-heavy': require('@digigate/design/vehicles/generic-truck-heavy-neutral.webp'),
  motorbike: require('@digigate/design/vehicles/generic-motorbike-neutral.webp'),
};

/**
 * The car behind a scanned disc: its body shape, and the make, model and colour in the disc's own words for the guard
 * to check against the car. The plate is left out so the guard reads it off the car. Tapping it, when `onOpen` is
 * given, opens every detail on the disc.
 */
export function VehicleCard({ disc, onOpen }: { disc: ParsedLicenceDisc; onOpen?: () => void }) {
  const body = vehicleBodyFromDisc(disc.description);
  const expired = isExpired(disc.expiresOn, Date.now(), siteConfig.rules.utcOffsetMinutes);
  const name = `${disc.make} ${disc.model}`;

  const card = (pressed: boolean) => (
    <Card style={[styles.card, pressed && styles.pressed]}>
      <View style={styles.top}>
        {body ? (
          <View style={styles.art}>
            <Image source={BODY_ART[body]} style={styles.artImage} contentFit="contain" accessibilityLabel={englishPart(disc.description)} />
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

      <View style={styles.chips}>
        {expired ? (
          <Chip label="Disc expired" tone="blocked" icon="result-blocked" />
        ) : (
          <Chip label={`Valid to ${formatDate(disc.expiresOn)}`} tone="clear" icon="check" />
        )}
      </View>

      <View style={styles.compare}>
        <Icon name="info" size={20} color={colors.brand} />
        <Text variant="label" style={styles.compareCopy}>
          {body
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
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
