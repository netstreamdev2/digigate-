import { colors, radius, space } from '@digigate/design';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionTile } from '@/components/action-tile';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { Logo } from '@/components/logo';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { useHostSession } from '@/host/host-session';
import { loadInvites, problemWords, whenWords, type HostInvite } from '@/host/invites';

const STATUS = {
  active: { label: 'Valid', tone: 'clear' },
  used: { label: 'Used', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'blocked' },
  expired: { label: 'Over', tone: 'neutral' },
} as const;

/** The host's home: invite someone new, and every invite they've sent, still-valid ones first. */
export default function HostHome() {
  const insets = useSafeAreaInsets();
  const { state, signOut } = useHostSession();
  const [invites, setInvites] = useState<HostInvite[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = state.status === 'signed-in' && state.name ? state.name.split(/\s+/)[0] : null;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setInvites(await loadInvites());
      setProblem(null);
    } catch (cause) {
      setProblem(problemWords(cause));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Fresh each time the list comes back into view, such as after sending or cancelling one.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View style={styles.topBar}>
        <Logo height={26} />
        <IconButton icon="exit" label="Sign out" onPress={() => void signOut()} />
      </View>

      <View style={styles.heading}>
        <Text variant="display">{name ? `Hi ${name},\nwho's coming?` : "Who's coming?"}</Text>
      </View>

      <ActionTile icon="visitor" label="Invite a visitor" detail="They get a QR to show at the gate" tint={colors.tileSky} onPress={() => router.push('/host/new')} />

      {problem ? <ResultBanner compact tone="warning" title="Couldn't load your invites" message={problem} /> : null}

      <View style={styles.list}>
        <Text variant="overline" color={colors.inkMuted}>
          Your invites
        </Text>
        {invites === null ? null : invites.length === 0 ? (
          <Text variant="body" color={colors.inkMuted}>
            None yet. Invite someone and they&apos;ll show here.
          </Text>
        ) : (
          invites.map((invite) => {
            const status = STATUS[invite.status];
            return (
              <Pressable
                key={invite.id}
                accessibilityRole="button"
                accessibilityLabel={`${invite.visitorName}, ${whenWords(invite.validFrom, invite.validUntil)}, ${status.label}`}
                onPress={() => router.push({ pathname: '/host/[id]', params: { id: invite.id } })}
                style={({ pressed }) => [styles.invite, invite.status !== 'active' && styles.inviteDone, pressed && styles.pressed]}
              >
                <View style={styles.inviteIcon}>
                  <Icon name="visitor" size={22} color={colors.brand} />
                </View>
                <View style={styles.inviteCopy}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {invite.visitorName}
                  </Text>
                  <Text variant="label" color={colors.inkMuted} numberOfLines={1}>
                    {`${whenWords(invite.validFrom, invite.validUntil)} · ${invite.siteName}`}
                  </Text>
                </View>
                <Chip label={status.label} tone={status.tone} />
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.xl,
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
  list: {
    gap: space.sm,
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteDone: {
    opacity: 0.6,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  inviteIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.tileSky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCopy: {
    flex: 1,
    gap: 2,
  },
});
