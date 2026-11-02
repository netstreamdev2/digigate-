import { colors, radius, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { siteConfig, visitTypeOf } from '@/site/site-config';

import { Icon } from './icon';
import { OptionTile } from './option-tile';
import { Text } from './text';

/**
 * The reason for the visit as colour-coded tiles, each with its own icon. Once the check has run (`locked`), only
 * the chosen one stays, so the result screen shows what was recorded.
 */
export function VisitTypePicker({ value, onChange, locked }: { value: string; onChange: (code: string) => void; locked: boolean }) {
  const chosen = visitTypeOf(value);
  return (
    <View style={styles.section} accessibilityRole="radiogroup">
      <Text variant="overline" color={colors.inkMuted}>
        Reason for the visit
      </Text>
      <View style={styles.grid}>
        {locked
          ? chosen && <OptionTile label={chosen.label} icon={chosen.icon} tint={chosen.tint} selected />
          : siteConfig.visitTypes.map((type) => (
              <OptionTile
                key={type.code}
                label={type.label}
                icon={type.icon}
                tint={type.tint}
                selected={type.code === value}
                onPress={() => onChange(type.code)}
              />
            ))}
      </View>
    </View>
  );
}

/** A visit type as a small coloured label with its icon, for summaries. */
export function VisitTypeBadge({ code }: { code: string }) {
  const type = visitTypeOf(code);
  return (
    <View style={[styles.badgeRow, { backgroundColor: type ? colors[type.tint] : colors.surfaceMuted }]}>
      {type ? <Icon name={type.icon} size={16} /> : null}
      <Text variant="label">{type?.label ?? code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    height: 30,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
});
