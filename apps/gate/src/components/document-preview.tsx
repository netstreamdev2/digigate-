import {
  checkLicence,
  isExpired,
  licencePassesChecks,
  type DecodedDocument,
  type DriverLicence,
  type LicenceChecks,
  type ParsedLicenceDisc,
} from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { demoPost } from '@/demo/gate-demo';
import { formatDate, formatPlate, formatSaIdNumber, titleCase } from '@/lib/format';

import { Card } from './card';
import { Chip } from './chip';
import { Icon, type IconName } from './icon';
import { ResultBanner } from './result-banner';
import { Text } from './text';

// The guard compares these with the physical document, so the current scan shows every value in full.
// Lists and history mask identifiers instead (CLAUDE.md, Privacy & security).

const DRIVER_RESTRICTIONS: Record<string, string> = { '1': 'Glasses or contact lenses', '2': 'Artificial limb' };

const UNREADABLE_DOCUMENT = { 'licence-disc': 'licence disc', 'driver-licence': "driver's licence" } as const;

const CHECK_LABELS: Record<keyof LicenceChecks, string> = {
  idNumberValid: 'ID number check digit is valid',
  birthDateMatchesIdNumber: 'Birth date matches the ID number',
  genderMatchesIdNumber: 'Gender matches the ID number',
  datesInOrder: 'Valid-from date is before expiry',
};

type Field = { label: string; value: string; wide?: boolean };

const orNone = (values: readonly string[]) => (values.length > 0 ? values.join(', ') : 'None');
const orBlank = (date: string | null) => (date ? formatDate(date) : 'Not on card');

function ExpiryChip({ expiresOn }: { expiresOn: string }) {
  const expired = isExpired(expiresOn, Date.now(), demoPost.utcOffsetMinutes);
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

function LicenceChecksView({ checks }: { checks: LicenceChecks }) {
  const applicable = (Object.keys(CHECK_LABELS) as (keyof LicenceChecks)[]).filter((key) => checks[key] !== null);
  const passed = licencePassesChecks(checks);

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
          <Text variant="body">{CHECK_LABELS[key]}</Text>
        </View>
      ))}
      <Text variant="label" color={colors.inkMuted}>
        Passing doesn't prove a card is genuine. Compare the name, ID number and photo on the card itself.
      </Text>
    </View>
  );
}

function LicencePreview({ licence }: { licence: DriverLicence }) {
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
      <LicenceChecksView checks={checkLicence(licence)} />
    </Card>
  );
}

/** A decoded scan, laid out the way the gate screens will show it. */
export function DocumentPreview({ decoded }: { decoded: DecodedDocument }) {
  switch (decoded.kind) {
    case 'licence-disc':
      return <DiscPreview disc={decoded.disc} />;
    case 'driver-licence':
      return <LicencePreview licence={decoded.licence} />;
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
          message="Scan the back of a driver's licence or the barcode on a licence disc."
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
