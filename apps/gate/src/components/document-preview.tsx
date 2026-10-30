import {
  checkLicence,
  checkSmartId,
  factsFromSaIdNumber,
  isExpired,
  isValidSaIdNumber,
  licencePassesChecks,
  smartIdPassesChecks,
  type DecodedDocument,
  type DriverLicence,
  type LicenceChecks,
  type LicencePhotoResult,
  type ParsedLicenceDisc,
  type SmartIdCard,
  type SmartIdChecks,
} from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { siteConfig } from '@/site/site-config';
import { formatDate, formatPlate, formatSaIdNumber, titleCase } from '@/lib/format';
import { greyscaleBmpUri } from '@/lib/greyscale-bmp';

import { Card } from './card';
import { Chip } from './chip';
import { Icon, type IconName } from './icon';
import { ResultBanner } from './result-banner';
import { Text } from './text';

// The guard compares these with the physical document, so the current scan shows every value in full.

const DRIVER_RESTRICTIONS: Record<string, string> = { '1': 'Glasses or contact lenses', '2': 'Artificial limb' };

const UNREADABLE_DOCUMENT = { 'licence-disc': 'licence disc', 'driver-licence': "driver's licence", 'smart-id': 'smart ID card' } as const;

const LICENCE_CHECK_LABELS: Record<keyof LicenceChecks, string> = {
  idNumberValid: 'ID number check digit is valid',
  birthDateMatchesIdNumber: 'Birth date matches the ID number',
  genderMatchesIdNumber: 'Gender matches the ID number',
  datesInOrder: 'Valid-from date is before expiry',
};

const SMART_ID_CHECK_LABELS: Record<keyof SmartIdChecks, string> = {
  idNumberValid: 'ID number check digit is valid',
  birthDateMatchesIdNumber: 'Birth date matches the ID number',
  genderMatchesIdNumber: 'Gender matches the ID number',
  citizenshipMatchesIdNumber: 'Citizenship matches the ID number',
  datesInOrder: 'Issued after the birth date',
};

type Field = { label: string; value: string; wide?: boolean };

const orNone = (values: readonly string[]) => (values.length > 0 ? values.join(', ') : 'None');
const orBlank = (date: string | null) => (date ? formatDate(date) : 'Not on card');

function ExpiryChip({ expiresOn }: { expiresOn: string }) {
  const expired = isExpired(expiresOn, Date.now(), siteConfig.rules.utcOffsetMinutes);
  return <Chip label={expired ? 'Expired' : 'Valid'} icon={expired ? 'result-blocked' : 'check'} tone={expired ? 'blocked' : 'clear'} />;
}

function Header({ icon, tint, caption, title, detail }: { icon: IconName; tint: string; caption: string; title: string; detail: string }) {
  return (
    <View style={styles.header}>
      <View style={[styles.badge, { backgroundColor: tint }]}>
        <Icon name={icon} size={24} />
      </View>
      <View style={styles.headerCopy}>
        <Text variant="overline" color={colors.inkMuted}>
          {caption}
        </Text>
        <Text variant="heading">{title}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

function Section({ title, fields }: { title: string; fields: readonly Field[] }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color={colors.brand}>
        {title}
      </Text>
      <View style={styles.fields}>
        {fields.map((field) => (
          <View key={field.label} style={[styles.field, field.wide && styles.fieldWide]}>
            <Text variant="overline" color={colors.inkSubtle}>
              {field.label}
            </Text>
            <Text variant="bodyStrong" selectable>
              {field.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DiscPreview({ disc }: { disc: ParsedLicenceDisc }) {
  return (
    <Card style={styles.card}>
      <Header
        icon="licence-disc"
        tint={colors.tileSky}
        caption="Licence disc"
        title={`${disc.make} ${disc.model}`}
        detail={`Expires ${formatDate(disc.expiresOn)}`}
      />
      <View style={styles.plate}>
        <Text variant="title" style={styles.plateText}>
          {formatPlate(disc.plate)}
        </Text>
        <ExpiryChip expiresOn={disc.expiresOn} />
      </View>
      <Section
        title="Vehicle"
        fields={[
          { label: 'Make', value: disc.make },
          { label: 'Model', value: disc.model },
          { label: 'Colour', value: disc.colour, wide: true },
          { label: 'Description', value: disc.description, wide: true },
          { label: 'VIN', value: disc.vin, wide: true },
          { label: 'Engine number', value: disc.engineNumber, wide: true },
        ]}
      />
      <Section
        title="Disc"
        fields={[
          { label: 'Number plate', value: disc.plate },
          { label: 'Register number', value: disc.registerNumber },
          { label: 'Disc number', value: disc.discNumber },
          { label: 'Expires', value: formatDate(disc.expiresOn) },
        ]}
      />
    </Card>
  );
}

function ChecksView<Key extends string>({
  checks,
  labels,
  passed,
  note,
}: {
  checks: Record<Key, boolean | null>;
  labels: Record<Key, string>;
  passed: boolean;
  note: string;
}) {
  const applicable = (Object.keys(labels) as Key[]).filter((key) => checks[key] !== null);

  return (
    <View style={styles.section}>
      <View style={styles.checksHeader}>
        <Text variant="overline" color={colors.brand}>
          Barcode checks
        </Text>
        <Chip label={passed ? 'All pass' : 'Look closely'} icon={passed ? 'check' : 'result-warning'} tone={passed ? 'clear' : 'blocked'} />
      </View>
      {applicable.map((key) => (
        <View key={key} style={styles.check}>
          <Icon name={checks[key] ? 'result-clear' : 'result-blocked'} size={20} color={checks[key] ? colors.clear : colors.blocked} />
          <Text variant="body">{labels[key]}</Text>
        </View>
      ))}
      <Text variant="label" color={colors.inkMuted}>
        {note}
      </Text>
    </View>
  );
}

function SmartIdPreview({ card }: { card: SmartIdCard }) {
  const checks = checkSmartId(card);
  return (
    <Card style={styles.card}>
      <Header icon="id-card" tint={colors.tileSky} caption="Smart ID card" title={titleCase(`${card.names} ${card.surname}`)} detail={titleCase(card.status)} />
      <Section
        title="Holder"
        fields={[
          { label: 'Surname', value: card.surname },
          { label: 'Names', value: card.names },
          { label: 'ID number', value: formatSaIdNumber(card.idNumber), wide: true },
          { label: 'Birth date', value: formatDate(card.birthDate) },
          { label: 'Gender', value: titleCase(card.gender) },
          { label: 'Nationality', value: card.nationality },
          { label: 'Country of birth', value: card.countryOfBirth },
          { label: 'Status', value: titleCase(card.status) },
        ]}
      />
      <Section
        title="Card"
        fields={[
          { label: 'Issued', value: formatDate(card.issuedOn) },
          { label: 'Security number', value: card.securityNumber },
        ]}
      />
      <ChecksView
        checks={checks}
        labels={SMART_ID_CHECK_LABELS}
        passed={smartIdPassesChecks(checks)}
        note="Passing doesn't prove a card is genuine. Compare the name, ID number and photo on the card itself."
      />
    </Card>
  );
}

const ID_BOOK_CHECK_LABELS = {
  idNumberValid: 'ID number check digit is valid',
  genderMatchesIdNumber: 'Sex matches the ID number',
} as const;

export type IdBookDetails = { idNumber: string; names: string; surname: string; gender: 'male' | 'female' };

/** A green ID book: the ID number from its barcode, and the name and sex the guard typed in. */
export function IdBookPreview({ book }: { book: IdBookDetails }) {
  const facts = factsFromSaIdNumber(book.idNumber, Date.now());
  const checks = {
    idNumberValid: isValidSaIdNumber(book.idNumber),
    genderMatchesIdNumber: facts ? facts.gender === book.gender : null,
  };
  return (
    <Card style={styles.card}>
      <Header
        icon="id-book"
        tint={colors.tileMint}
        caption="Green ID book"
        title={titleCase(`${book.names} ${book.surname}`)}
        detail="Name and sex typed in by the guard"
      />
      <Section
        title="Holder"
        fields={[
          { label: 'Surname', value: book.surname },
          { label: 'Names', value: book.names },
          { label: 'ID number', value: formatSaIdNumber(book.idNumber), wide: true },
          { label: 'Sex', value: book.gender === 'male' ? 'Male' : 'Female' },
          { label: 'Birth date', value: facts ? formatDate(facts.birthDate) : 'Not in the ID number' },
          { label: 'Citizenship', value: facts ? (facts.citizen ? 'Citizen' : 'Permanent resident') : 'Unknown' },
        ]}
      />
      <ChecksView
        checks={checks}
        labels={ID_BOOK_CHECK_LABELS}
        passed={Object.values(checks).every((result) => result !== false)}
        note="The birth date and citizenship come from the ID number. Compare the name and photo in the book with the person."
      />
    </Card>
  );
}

const PHOTO_PROBLEM: Record<Exclude<LicencePhotoResult, { ok: true }>['reason'], string> = {
  'not-a-licence': 'No photo in this barcode.',
  'not-a-wavelet-image': 'No photo in this barcode.',
  unsupported: "This licence's photo is in a format DigiGate can't read yet. Check the photo on the card.",
  damaged: "The photo in this barcode didn't decode. Check the photo on the card.",
};

/** The photo stored in the barcode, decoded after the result is on screen. Never cached or saved. */
function LicencePhotoView({ photo }: { photo: LicencePhotoResult | null }) {
  const uri = useMemo(() => (photo?.ok ? greyscaleBmpUri(photo.photo) : null), [photo]);
  return (
    <View style={styles.photoRow}>
      <View style={styles.photoFrame}>
        {uri ? (
          <Image source={{ uri }} style={styles.photo} contentFit="cover" cachePolicy="none" accessibilityLabel="Photo from the licence barcode" />
        ) : null}
      </View>
      <Text variant="label" color={colors.inkMuted} style={styles.photoCaption}>
        {photo === null
          ? 'Reading the photo…'
          : photo.ok
            ? 'From the barcode. Compare it with the photo on the card and with the driver.'
            : PHOTO_PROBLEM[photo.reason]}
      </Text>
    </View>
  );
}

function LicencePreview({ licence, photo }: { licence: DriverLicence; photo: LicencePhotoResult | null }) {
  const driverRestrictions = Array.from(licence.driverRestrictionCodes)
    .map((code) => DRIVER_RESTRICTIONS[code])
    .filter((label): label is string => label !== undefined);

  return (
    <Card style={styles.card}>
      <Header
        icon="licence-card"
        tint={colors.tileLilac}
        caption="Driver's licence"
        title={`${licence.initials} ${titleCase(licence.surname)}`}
        detail={`Codes ${orNone(licence.vehicleCodes)}`}
      />
      <LicencePhotoView photo={photo} />
      {licence.expiresOn ? (
        <View style={styles.status}>
          <Text variant="label" color={colors.inkMuted}>
            {`Valid until ${formatDate(licence.expiresOn)}`}
          </Text>
          <ExpiryChip expiresOn={licence.expiresOn} />
        </View>
      ) : null}
      <Section
        title="Holder"
        fields={[
          { label: 'Surname', value: licence.surname },
          { label: 'Initials', value: licence.initials },
          { label: 'ID number', value: formatSaIdNumber(licence.idNumber), wide: true },
          { label: 'Birth date', value: orBlank(licence.birthDate) },
          { label: 'Gender', value: licence.gender ? titleCase(licence.gender) : 'Not on card' },
          { label: 'ID issued in', value: licence.idCountryOfIssue },
          { label: 'ID type', value: licence.idNumberType === '02' ? 'South African ID' : `Type ${licence.idNumberType}` },
        ]}
      />
      <Section
        title="Licence"
        fields={[
          { label: 'Licence number', value: licence.licenceNumber, wide: true },
          { label: 'Vehicle codes', value: orNone(licence.vehicleCodes) },
          { label: 'Issue number', value: licence.licenceIssueNumber },
          { label: 'Codes first issued', value: orNone(licence.licenceCodeIssueDates.map(formatDate)), wide: true },
          { label: 'Valid from', value: orBlank(licence.validFrom) },
          { label: 'Valid until', value: orBlank(licence.expiresOn) },
          { label: 'Vehicle restrictions', value: orNone(licence.vehicleRestrictions) },
          { label: 'Driver restrictions', value: orNone(driverRestrictions) },
          { label: 'PrDP', value: licence.prdpCode ?? 'None' },
          { label: 'PrDP expires', value: licence.prdpCode ? orBlank(licence.prdpExpiresOn) : '—' },
          { label: 'Licence issued in', value: licence.licenceCountryOfIssue },
        ]}
      />
      <LicenceChecks licence={licence} />
    </Card>
  );
}

function LicenceChecks({ licence }: { licence: DriverLicence }) {
  const checks = checkLicence(licence);
  return (
    <ChecksView
      checks={checks}
      labels={LICENCE_CHECK_LABELS}
      passed={licencePassesChecks(checks)}
      note="Passing doesn't prove a card is genuine. Compare the name, ID number and photo on the card itself."
    />
  );
}

/** A decoded scan, laid out the way the gate screens will show it. `photo` is null until the licence photo decodes. */
export function DocumentPreview({ decoded, photo }: { decoded: DecodedDocument; photo: LicencePhotoResult | null }) {
  switch (decoded.kind) {
    case 'licence-disc':
      return <DiscPreview disc={decoded.disc} />;
    case 'driver-licence':
      return <LicencePreview licence={decoded.licence} photo={photo} />;
    case 'smart-id':
      return <SmartIdPreview card={decoded.card} />;
    case 'id-number':
      return (
        <ResultBanner
          tone="warning"
          title="ID number only"
          message="This barcode holds only an ID number: a green ID book, or the small barcode on a smart ID card. On a smart ID, scan the large square barcode for the full details."
        />
      );
    case 'unreadable':
      return (
        <ResultBanner
          tone="warning"
          title={`Couldn't read this ${UNREADABLE_DOCUMENT[decoded.document]}`}
          message={`Scan it again, holding it flat and steady. (${decoded.reason})`}
        />
      );
    case 'unrecognised':
      return (
        <ResultBanner
          tone="warning"
          title="Not a document DigiGate knows"
          message="Scan the back of a driver's licence or smart ID card, or the barcode on a licence disc."
        />
      );
  }
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  plateText: {
    letterSpacing: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  // The barcode photo is 200 by 250 pixels.
  photoFrame: {
    width: 120,
    height: 150,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoCaption: {
    flex: 1,
  },
  section: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md,
  },
  field: {
    width: '50%',
    paddingRight: space.xs,
    gap: 2,
  },
  fieldWide: {
    width: '100%',
  },
  checksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
