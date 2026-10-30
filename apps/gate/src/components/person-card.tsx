import {
  checkLicence,
  checkSmartId,
  factsFromSaIdNumber,
  isExpired,
  licencePassesChecks,
  smartIdPassesChecks,
  type DriverLicence,
  type LicencePhotoResult,
  type SmartIdCard,
} from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate, formatSaIdNumber, titleCase } from '@/lib/format';
import { greyscaleBmpUri } from '@/lib/greyscale-bmp';
import { siteConfig } from '@/site/site-config';

import { Card } from './card';
import { Chip } from './chip';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export type PersonDocument =
  | { kind: 'driver-licence'; licence: DriverLicence; photo: LicencePhotoResult | null }
  | { kind: 'smart-id'; card: SmartIdCard }
  /** A green ID book: the ID number scanned from its barcode, the name and sex typed in by the guard. */
  | { kind: 'id-book'; idNumber: string; names: string; surname: string; gender: 'male' | 'female' };

type ChipSpec = { label: string; tone: 'neutral' | 'clear' | 'blocked'; icon?: IconName };

type CardContent = {
  caption: string;
  name: string;
  idNumber: string;
  chips: ChipSpec[];
  /** What to compare with the person, when the card has a barcode photo to compare. */
  compare: string | null;
  photo: LicencePhotoResult | null | 'none';
};

function describe(document: PersonDocument): CardContent {
  if (document.kind === 'driver-licence') {
    const { licence, photo } = document;
    const checksPass = licencePassesChecks(checkLicence(licence));
    const expired = licence.expiresOn ? isExpired(licence.expiresOn, Date.now(), siteConfig.rules.utcOffsetMinutes) : null;
    const chips: ChipSpec[] = [
      ...(licence.expiresOn
        ? [
            expired
              ? { label: 'Expired', tone: 'blocked' as const, icon: 'result-blocked' as const }
              : { label: `Valid to ${formatDate(licence.expiresOn)}`, tone: 'clear' as const, icon: 'check' as const },
          ]
        : []),
      { label: `Codes ${licence.vehicleCodes.join(', ') || 'none'}`, tone: 'neutral' },
      checksPass ? { label: 'Checks pass', tone: 'clear', icon: 'check' } : { label: 'Look closely', tone: 'blocked', icon: 'result-warning' },
    ];
    return {
      caption: "Driver's licence",
      name: `${licence.initials} ${titleCase(licence.surname)}`,
      idNumber: licence.idNumber,
      chips,
      compare:
        photo === null
          ? 'Reading the photo from the barcode…'
          : photo.ok
            ? "Compare this photo with the driver's face."
            : 'No usable photo in this barcode. Compare the photo on the card with the driver.',
      photo,
    };
  }
  if (document.kind === 'id-book') {
    const facts = factsFromSaIdNumber(document.idNumber, Date.now());
    const sexMatches = facts?.gender === document.gender;
    return {
      caption: 'Green ID book',
      name: titleCase(`${document.names} ${document.surname}`),
      idNumber: document.idNumber,
      chips: [
        ...(facts
          ? [
              { label: `Born ${formatDate(facts.birthDate)}`, tone: 'neutral' as const },
              { label: facts.citizen ? 'Citizen' : 'Permanent resident', tone: 'neutral' as const },
            ]
          : []),
        sexMatches
          ? { label: document.gender === 'male' ? 'Male' : 'Female', tone: 'clear', icon: 'check' }
          : { label: "Sex doesn't match the ID number", tone: 'blocked', icon: 'result-warning' },
        { label: 'Typed by hand', tone: 'neutral', icon: 'manual-entry' },
      ],
      compare: null,
      photo: 'none',
    };
  }
  const { card } = document;
  const checksPass = smartIdPassesChecks(checkSmartId(card));
  return {
    caption: 'Smart ID card',
    name: titleCase(`${card.names} ${card.surname}`),
    idNumber: card.idNumber,
    chips: [
      { label: titleCase(card.status), tone: 'neutral' },
      { label: `Born ${formatDate(card.birthDate)}`, tone: 'neutral' },
      checksPass ? { label: 'Checks pass', tone: 'clear', icon: 'check' } : { label: 'Look closely', tone: 'blocked', icon: 'result-warning' },
    ],
    compare: null,
    photo: 'none',
  };
}

/** A licence's barcode photo, or the card's icon while it decodes or if there is none. */
function Photo({ photo }: { photo: LicencePhotoResult | null }) {
  const uri = useMemo(() => (photo?.ok ? greyscaleBmpUri(photo.photo) : null), [photo]);
  return (
    <View style={styles.photo}>
      {uri ? (
        // Shown for this scan only: never cached or saved.
        <Image source={{ uri }} style={styles.photoImage} contentFit="cover" cachePolicy="none" accessibilityLabel="Photo from the barcode" />
      ) : (
        <Icon name="licence-card" size={40} color={colors.brand} />
      )}
    </View>
  );
}

/** An ID barcode has no photo, so the document's own icon stands in, on its own. */
function IdIcon({ kind }: { kind: PersonDocument['kind'] }) {
  return (
    <View style={styles.idIcon}>
      <Icon name={kind === 'id-book' ? 'id-book' : 'id-card'} size={40} color={colors.brand} />
    </View>
  );
}

/**
 * The person behind a scanned licence or smart ID: photo, name and ID number large enough to compare at arm's
 * length, with what matters as chips. Tapping it opens every detail on the card.
 */
export function PersonCard({ document, onOpen }: { document: PersonDocument; onOpen: () => void }) {
  const view = describe(document);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${view.name}. Show all details`}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.pressed]}>
          <View style={[styles.top, view.photo === 'none' && styles.topCompact]}>
            {view.photo === 'none' ? <IdIcon kind={document.kind} /> : <Photo photo={view.photo} />}
            <View style={styles.identity}>
              <Text variant="overline" color={colors.inkMuted}>
                {view.caption}
              </Text>
              <Text variant="title" numberOfLines={2}>
                {view.name}
              </Text>
              <Text variant="bodyStrong" color={colors.inkMuted} selectable>
                {formatSaIdNumber(view.idNumber)}
              </Text>
            </View>
          </View>

          <View style={styles.chips}>
            {view.chips.map((chip) => (
              <Chip key={chip.label} label={chip.label} tone={chip.tone} {...(chip.icon ? { icon: chip.icon } : {})} />
            ))}
          </View>

          {view.compare ? (
            <View style={styles.compare}>
              <Icon name="info" size={20} color={colors.brand} />
              <Text variant="label" style={styles.compareCopy}>
                {view.compare}
              </Text>
            </View>
          ) : null}

          <View style={styles.more}>
            <Text variant="bodyStrong">All details</Text>
            <View style={styles.chevron}>
              <Icon name="back" size={20} color={colors.ink} />
            </View>
          </View>
        </Card>
      )}
    </Pressable>
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
    gap: space.md,
  },
  topCompact: {
    alignItems: 'center',
  },
  // The barcode photo is 200 by 250 pixels; this keeps its 4:5 shape.
  photo: {
    width: 112,
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tileLilac,
  },
  idIcon: {
    paddingHorizontal: space.xxs,
    justifyContent: 'center',
  },
  photoImage: {
    width: '100%',
    height: '100%',
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
