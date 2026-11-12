import { inviteQrText } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { Logo } from '@/components/logo';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { cancelInvite, loadInvites, problemWords, whenWords, type HostInvite } from '@/host/invites';
import { QrCode } from '@/host/qr-code';
import { visitTypeOf } from '@/site/site-config';

const QR_SIZE = 236;

/** One invite: the card the visitor gets, shared as a picture, and cancelling it if plans change. */
export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [invite, setInvite] = useState<HostInvite | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    let live = true;
    loadInvites().then(
      (all) => {
        if (!live) return;
        const found = all.find((item) => item.id === id) ?? null;
        setInvite(found);
        if (!found) setProblem("That invite isn't on your list any more.");
      },
      (cause: unknown) => {
        if (live) setProblem(problemWords(cause));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  const share = async () => {
    if (!invite) return;
    setBusy(true);
    setProblem(null);
    try {
      const picture = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(picture, { mimeType: 'image/png', dialogTitle: `Invite for ${invite.visitorName}` });
    } catch (cause) {
      setProblem(`The picture couldn't be shared (${cause instanceof Error ? cause.message : 'unknown error'}). Try again.`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!invite) return;
    setBusy(true);
    setProblem(null);
    try {
      await cancelInvite(invite.id);
      router.back();
    } catch (cause) {
      setProblem(problemWords(cause));
      setBusy(false);
    }
  };

  const usable = invite?.status === 'active' && invite.code !== null;
  const visitType = invite?.visitType ? (visitTypeOf(invite.visitType)?.label ?? null) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
      </View>

      {problem ? <ResultBanner compact tone="warning" title="Something's wrong" message={problem} /> : null}

      {invite ? (
        <>
          {/* What the visitor receives: everything they need on one picture, with nothing about who invited them. */}
          <View ref={card} collapsable={false} style={styles.card}>
            <View style={styles.cardTop}>
              <Logo height={24} />
              <Text variant="overline" color={colors.brand}>
                You&apos;re invited
              </Text>
            </View>
            <View style={styles.cardCopy}>
              <Text variant="title">{invite.visitorName}</Text>
              <Text variant="bodyStrong">{invite.siteName}</Text>
              <Text variant="label" color={colors.inkMuted}>
                {[whenWords(invite.validFrom, invite.validUntil), visitType].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.qr}>
              {usable && invite.code ? (
                <QrCode text={inviteQrText(invite.code)} size={QR_SIZE} />
              ) : (
                <View style={[styles.qrGone, { width: QR_SIZE, height: QR_SIZE }]}>
                  <Text variant="heading" color={colors.inkMuted}>
                    {invite.status === 'used' ? 'Used' : invite.status === 'cancelled' ? 'Cancelled' : 'Over'}
                  </Text>
                </View>
              )}
            </View>
            <Text variant="label" color={colors.inkMuted} style={styles.cardFoot}>
              Show this at the gate with your ID or driver&apos;s licence.
            </Text>
          </View>

          {usable ? (
            <View style={styles.actions}>
              <PillButton label={busy ? 'Getting it ready…' : 'Share the invite'} icon="visitor" disabled={busy} onPress={() => void share()} />
              {confirming ? (
                <>
                  <Text variant="body" color={colors.inkMuted}>
                    Cancel it? The QR stops working at every gate once they've synced.
                  </Text>
                  <PillButton label="Yes, cancel it" icon="result-blocked" variant="secondary" disabled={busy} onPress={() => void cancel()} />
                  <PillButton label="Keep it" variant="secondary" onPress={() => setConfirming(false)} />
                </>
              ) : (
                <PillButton label="Cancel the invite" variant="secondary" onPress={() => setConfirming(true)} />
              )}
            </View>
          ) : (
            <Chip label={invite.status === 'used' ? 'They came in with it' : invite.status === 'cancelled' ? 'You cancelled it' : 'Its days are over'} />
          )}
        </>
      ) : null}
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
    gap: space.lg,
  },
  topBar: {
    height: 56,
    justifyContent: 'center',
  },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCopy: {
    gap: 2,
  },
  qr: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  qrGone: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  cardFoot: {
    textAlign: 'center',
  },
  actions: {
    gap: space.sm,
  },
});
