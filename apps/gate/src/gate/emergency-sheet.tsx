import { OTHER_EMERGENCY, type EmergencyKind } from '@digigate/core';
import { colors, radius, space, typography } from '@digigate/design';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { KeyboardInput, KeyboardScroll, useKeyboardHeight } from '@/components/keyboard-scroll';
import { OptionTile, wideTiles } from '@/components/option-tile';
import { PillButton } from '@/components/pill-button';
import { Text } from '@/components/text';
import { emergencyKinds } from '@/site/site-config';

import type { EmergencyChoice } from './emergency';

/**
 * What kind of emergency, in one tap: a plain sheet over the screen with no animation, so it's there the moment the
 * guard asks. Choosing doesn't let anyone in; the check still needs their licence or ID.
 */
export function EmergencySheet({ onChoose, onCancel }: { onChoose: (choice: EmergencyChoice) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const kinds = emergencyKinds();
  const wide = wideTiles(kinds.map(({ label }) => label));
  const [other, setOther] = useState(false);
  const [note, setNote] = useState('');

  const choose = (kind: EmergencyKind) => {
    if (kind.code === OTHER_EMERGENCY) {
      setOther(true);
      return;
    }
    onChoose({ kind, note: null });
  };

  const otherKind = kinds.find(({ code }) => code === OTHER_EMERGENCY);

  return (
    // While the keyboard is up the sheet ends at its top, so the field and its button stay in sight.
    <View style={[styles.sheet, { paddingTop: insets.top, paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Cancel" tone="dark" onPress={onCancel} />
      </View>
      <KeyboardScroll contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text variant="overline" color={colors.blocked}>
            Emergency
          </Text>
          <Text variant="display">What kind?</Text>
          <Text variant="body" color={colors.inkMuted}>
            Ask them to wait a moment: you still scan their licence or ID before they go in.
          </Text>
        </View>

        <View style={styles.grid} accessibilityRole="radiogroup">
          {kinds.map((kind, index) => (
            <OptionTile
              key={kind.code}
              label={kind.label}
              icon={kind.code === OTHER_EMERGENCY ? 'manual-entry' : 'emergency'}
              tint="blockedSoft"
              selected={other && kind.code === OTHER_EMERGENCY}
              wide={wide[index] ?? true}
              onPress={() => choose(kind)}
            />
          ))}
        </View>

        {other && otherKind ? (
          <View style={styles.other}>
            <KeyboardInput
              value={note}
              onChangeText={setNote}
              placeholder="What is it? A word or two"
              placeholderTextColor={colors.inkSubtle}
              maxLength={40}
              autoFocus
              style={styles.input}
              accessibilityLabel="What kind of emergency"
            />
            <PillButton label="Use this" icon="check" disabled={note.trim() === ''} onPress={() => onChoose({ kind: otherKind, note: note.trim() })} />
          </View>
        ) : null}
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
  },
  topBar: {
    height: 56,
    justifyContent: 'center',
  },
  content: {
    gap: space.lg,
    paddingBottom: space.xl,
  },
  heading: {
    gap: space.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  other: {
    gap: space.sm,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.body,
  },
});
