import { colors, radius, shadow, space } from '@digigate/design';
import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { Icon, type IconName } from './icon';
import { Text } from './text';

type Stat = {
  icon: IconName;
  value: string;
  label: string;
};

type Props = {
  stats: readonly Stat[];
};

export function StatStrip({ stats }: Props) {
  return (
    <Card style={styles.strip}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.stat}>
          <View style={styles.halo}>
            <Icon name={stat.icon} size={20} color={colors.brand} />
          </View>
          <Text variant="stat">{stat.value}</Text>
          <Text variant="overline" color={colors.inkMuted} style={styles.label}>
            {stat.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    paddingVertical: space.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: space.xxs,
  },
  halo: {
    width: 40,
    height: 40,
    marginBottom: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.tileSky,
    boxShadow: shadow.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
});
