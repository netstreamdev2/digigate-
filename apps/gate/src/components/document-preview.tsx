import { colors, radius, space } from '@digigate/design';
import { englishPart, isExpired, type DecodedDocument, type DriverLicence, type ParsedLicenceDisc } from '@digigate/core';
import { StyleSheet, View } from 'react-native';

import { demoPost } from '@/demo/gate-demo';
import { formatDate, formatPlate, maskAllButLast, titleCase } from '@/lib/format';

import { Card } from './card';
import { Chip } from './chip';
import { Icon, type IconName } from './icon';
import { ResultBanner } from './result-banner';
import { Text } from './text';

const RESTRICTIONS: Record<string, string> = { '1': 'Glasses or contact lenses', '2': 'Artificial limb' };

const UNREADABLE_DOCUMENT = { 'licence-disc': 'licence disc', 'driver-licence': "driver's licence" } as const;

type Field = { label: string; value: string };

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

function Fields({ fields }: { fields: readonly Field[] }) {
  return (
    <View style={styles.fields}>
      {fields.map((field) => (
        <View key={field.label} style={styles.field}>
          <Text variant="overline" color={colors.inkSubtle}>
            {field.label}
          </Text>
          <Text variant="bodyStrong">{field.value}</Text>
        </View>
      ))}
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
        detail={`${englishPart(disc.colour)} · ${englishPart(disc.description)}`}
      />
      <View style={styles.plate}>
        <Text variant="title" style={styles.plateText}>
          {formatPlate(disc.plate)}
        </Text>
        <ExpiryChip expiresOn={disc.expiresOn} />
      </View>
      <Fields
        fields={[
          { label: 'Expires', value: formatDate(disc.expiresOn) },
          { label: 'Register number', value: disc.registerNumber },
          { label: 'VIN', value: maskAllButLast(disc.vin, 6) },
          { label: 'Engine', value: maskAllButLast(disc.engineNumber, 4) },
        ]}
      />
    </Card>
  );
}

function LicencePreview({ licence }: { licence: DriverLicence }) {
  const restrictions = Array.from(licence.driverRestrictionCodes)
    .map((code) => RESTRICTIONS[code])
    .filter((label): label is string => label !== undefined);

  const fields: Field[] = [
    { label: 'Valid until', value: licence.expiresOn ? formatDate(licence.expiresOn) : 'Not on card' },
    { label: 'ID number', value: maskAllButLast(licence.idNumber, 3) },
    { label: 'Licence number', value: maskAllButLast(licence.licenceNumber, 4) },
    { label: 'Restrictions', value: restrictions.length > 0 ? restrictions.join(', ') : 'None' },
  ];
  if (licence.prdpCode) {
    fields.push({
      label: 'PrDP',
      value: `${licence.prdpCode}${licence.prdpExpiresOn ? ` · to ${formatDate(licence.prdpExpiresOn)}` : ''}`,
    });
  }

  return (
    <Card style={styles.card}>
      <Header
        icon="licence-card"
        tint={colors.tileLilac}
        caption="Driver's licence"
        title={`${licence.initials} ${titleCase(licence.surname)}`}
        detail={`Codes ${licence.vehicleCodes.join(', ')}`}
      />
      {licence.expiresOn ? (
        <View style={styles.status}>
          <ExpiryChip expiresOn={licence.expiresOn} />
        </View>
      ) : null}
      <Fields fields={fields} />
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
    gap: space.md,
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
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md,
  },
  field: {
    width: '50%',
    gap: 2,
  },
});
