import { colors, radius, space } from '@digigate/design';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { Text } from '@/components/text';
import { demoPost } from '@/demo/gate-demo';

export default function ShiftScreen() {
  const insets = useSafeAreaInsets();
  const { state, lock, signOut } = useSession();
  if (state.status === 'signed-out') return null;
  const { user, startedAt } = state;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
      </View>

      <View style={styles.heading}>
        <Text variant="overline" color={colors.inkMuted}>
          Your shift
        </Text>
        <Text variant="display">{`${user.firstName}\n${user.lastName}`}</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.person}>
          <View style={styles.avatar}>
            <Text variant="heading" color={colors.brand}>
              {`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`}
            </Text>
          </View>
          <Text variant="overline" color={colors.brand}>
            {user.role === 'supervisor' ? 'Supervisor' : 'Guard'}
          </Text>
        </View>
        <Field label="Employee number" value={user.employeeNumber} />
        <Field
          label="Signed in"
          value={new Date(startedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
        />
        <Field label="Post" value={`${demoPost.gate} · ${demoPost.lane}`} />
        <Field label="Screen locks after" value={`${demoPost.idleLockMinutes} minutes without a touch`} />
      </Card>

      <View style={styles.actions}>
        <PillButton label="Switch guard" icon="guard" onPress={signOut} />
        <PillButton label="Lock screen" icon="lock" variant="secondary" onPress={lock} />
      </View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text variant="overline" color={colors.inkSubtle}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
    gap: space.lg,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    gap: space.xs,
  },
  card: {
    gap: space.md,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.tileLilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: 2,
  },
  actions: {
    marginTop: 'auto',
    gap: space.xs,
  },
});
