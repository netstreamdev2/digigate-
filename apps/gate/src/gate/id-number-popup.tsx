import { factsFromSaIdNumber } from '@digigate/core';
import { colors, radius, space, typography } from '@digigate/design';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import type { IdBookDetails } from '@/components/document-preview';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { Text } from '@/components/text';
import { formatDate, formatSaIdNumber, nameInput } from '@/lib/format';

type Gender = 'male' | 'female';

type Props = {
  idNumber: string;
  /** It's a smart ID: scan its large barcode instead. */
  onRetry: () => void;
  /** It's an ID book: here are the name and sex from the book. */
  onIdBook: (book: IdBookDetails) => void;
  onCancel: () => void;
};

function Choice({ icon, tint, title, detail, onPress }: { icon: IconName; tint: string; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.choice, { backgroundColor: tint }, pressed && styles.pressed]}>
      <View style={styles.choiceBadge}>
        <Icon name={icon} size={26} color={colors.brand} />
      </View>
      <View style={styles.choiceCopy}>
        <Text variant="heading">{title}</Text>
        <Text variant="label" color={colors.inkMuted}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

function SexButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.sex, selected && styles.sexSelected, pressed && styles.pressed]}>
      <Text variant="heading" color={selected ? colors.inkInverse : colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A scan that held only an ID number: the small barcode on a smart ID, or a green ID book's only barcode. The guard
 * says which. A smart ID gets a rescan of its large barcode; an ID book gets its name and sex typed in.
 */
export function IdNumberPopup({ idNumber, onRetry, onIdBook, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const facts = useMemo(() => factsFromSaIdNumber(idNumber, Date.now()), [idNumber]);
  const [step, setStep] = useState<'choose' | 'book'>('choose');
  const [names, setNames] = useState('');
  const [surname, setSurname] = useState('');
  // The ID number already says which; the guard confirms it against the book.
  const [gender, setGender] = useState<Gender | null>(facts?.gender ?? null);

  const ready = names.trim().length > 0 && surname.trim().length > 0 && gender !== null;
  const contradictsId = facts !== null && gender !== null && gender !== facts.gender;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Cancel" tone="dark" onPress={onCancel} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text variant="overline" color={colors.inkMuted}>
            ID number read
          </Text>
          <Text variant="display">{step === 'choose' ? 'What are they showing?' : 'Their details'}</Text>
        </View>

        <Card style={styles.number}>
          <Text variant="title" selectable>
            {formatSaIdNumber(idNumber)}
          </Text>
          {facts ? (
            <Text variant="label" color={colors.inkMuted}>
              {`Born ${formatDate(facts.birthDate)} · ${facts.citizen ? 'Citizen' : 'Permanent resident'}`}
            </Text>
          ) : null}
        </Card>

        {step === 'choose' ? (
          <View style={styles.choices}>
            <Choice icon="id-card" tint={colors.tileSky} title="Smart ID card" detail="Scan again, aiming at the large square barcode" onPress={onRetry} />
            <Choice icon="id-book" tint={colors.tileMint} title="Green ID book" detail="Type in their name from the book" onPress={() => setStep('book')} />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text variant="overline" color={colors.inkMuted}>
                First names
              </Text>
              <TextInput
                value={names}
                onChangeText={(text) => setNames(nameInput(text))}
                placeholder="As printed in the book"
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                maxLength={60}
                style={styles.input}
                accessibilityLabel="First names"
              />
            </View>
            <View style={styles.field}>
              <Text variant="overline" color={colors.inkMuted}>
                Surname
              </Text>
              <TextInput
                value={surname}
                onChangeText={(text) => setSurname(nameInput(text))}
                placeholder="As printed in the book"
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                maxLength={60}
                style={styles.input}
                accessibilityLabel="Surname"
              />
            </View>
            <View style={styles.field}>
              <Text variant="overline" color={colors.inkMuted}>
                Sex
              </Text>
              <View style={styles.sexRow} accessibilityRole="radiogroup">
                <SexButton label="Male" selected={gender === 'male'} onPress={() => setGender('male')} />
                <SexButton label="Female" selected={gender === 'female'} onPress={() => setGender('female')} />
              </View>
              {contradictsId && facts ? (
                <View style={styles.warning}>
                  <Icon name="result-warning" size={18} color={colors.warning} />
                  <Text variant="label" style={styles.warningCopy}>
                    {`The ID number says ${facts.gender}. Check the book before you carry on.`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {step === 'book' ? (
        <View style={styles.actions}>
          <PillButton
            label="Use these details"
            icon="check"
            disabled={!ready}
            onPress={() => {
              if (!gender) return;
              onIdBook({ idNumber, names: names.trim().toUpperCase(), surname: surname.trim().toUpperCase(), gender });
            }}
          />
          <PillButton label="Back" variant="secondary" onPress={() => setStep('choose')} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.lg,
    gap: space.md,
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
  number: {
    gap: space.xxs,
  },
  choices: {
    gap: space.sm,
  },
  choice: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
  },
  choiceBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.85,
  },
  form: {
    gap: space.lg,
  },
  field: {
    gap: space.xs,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.heading,
  },
  sexRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  sex: {
    flex: 1,
    height: 58,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  warningCopy: {
    flex: 1,
  },
  actions: {
    gap: space.xs,
  },
});
