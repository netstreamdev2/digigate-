import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { demoEntry, demoPost, demoVisitTypes, type DemoVisitType } from '@/demo/gate-demo';

const FOOTER_HEIGHT = 96;

export default function EntryScreen() {
  const insets = useSafeAreaInsets();
  const [occupants, setOccupants] = useState<number>(demoEntry.occupants);
  const [visitType, setVisitType] = useState<DemoVisitType>(demoEntry.visitType);
  const { disc, driver } = demoEntry;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FOOTER_HEIGHT }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label={`${demoPost.gate} · Entry`} icon="entry" />
        </View>

        <View style={styles.heading}>
          <Text variant="overline" color={colors.inkMuted}>
            Vehicle entry
          </Text>
          <Text variant="display">{"Who's coming in?"}</Text>
        </View>

        <Card style={styles.scans}>
          <ScanRow
            icon="licence-disc"
            tint={colors.tileSky}
            title="Licence disc"
            value={`${disc.make} ${disc.model} · ${disc.colour}`}
            detail={`Expires ${disc.expires}`}
          />
          <View style={styles.divider} />
          <ScanRow
            icon="licence-card"
            tint={colors.tileLilac}
            title="Driver's licence"
            value={driver.name}
            detail={`Code ${driver.code} · expires ${driver.expires}`}
          />
        </Card>

        <Card style={styles.plate}>
          <Text variant="overline" color={colors.inkMuted}>
            Plate on the car
          </Text>
          <View style={styles.plateRow}>
            <Text variant="title">{disc.plate}</Text>
            <Chip label="Matches disc" icon="check" tone="clear" />
          </View>
        </Card>

        <Card style={styles.occupants}>
          <View style={styles.occupantsCopy}>
            <Text variant="bodyStrong">People in the car</Text>
            <Text variant="label" color={colors.inkMuted}>
              Including the driver
            </Text>
          </View>
          <View style={styles.stepper}>
            <IconButton
              icon="remove"
              label="One person fewer"
              onPress={occupants > 1 ? () => setOccupants(occupants - 1) : undefined}
            />
            <Text variant="stat" style={styles.count}>
              {occupants}
            </Text>
            <IconButton icon="add" label="One person more" onPress={() => setOccupants(occupants + 1)} />
          </View>
        </Card>

        <View style={styles.visitTypes}>
          <Text variant="overline" color={colors.inkMuted}>
            Visit type
          </Text>
          <View style={styles.chips}>
            {demoVisitTypes.map((type) => (
              <Chip
                key={type}
                label={type}
                tone={type === visitType ? 'selected' : 'neutral'}
                onPress={() => setVisitType(type)}
              />
            ))}
          </View>
        </View>

        <ResultBanner tone="clear" title="All clear" message="No flags on this car or driver. The boom can open." />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <PillButton label="Open boom" icon="check" onPress={() => router.back()} />
      </View>
    </View>
  );
}

type ScanRowProps = {
  icon: IconName;
  tint: string;
  title: string;
  value: string;
  detail: string;
};

function ScanRow({ icon, tint, title, value, detail }: ScanRowProps) {
  return (
    <View style={styles.scanRow}>
      <View style={[styles.scanIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={22} />
      </View>
      <View style={styles.scanCopy}>
        <Text variant="overline" color={colors.inkMuted}>
          {title}
        </Text>
        <Text variant="bodyStrong">{value}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
      <Icon name="result-clear" size={26} color={colors.clear} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
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
  scans: {
    paddingVertical: space.xs,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  scanIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCopy: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  plate: {
    gap: space.xs,
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  occupants: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  occupantsCopy: {
    flex: 1,
    gap: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  count: {
    minWidth: 28,
    textAlign: 'center',
  },
  visitTypes: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
  },
});
