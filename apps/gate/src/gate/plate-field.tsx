import { normaliseIdentifier, plateDifferences } from '@digigate/core';
import { colors, radius, space, typography } from '@digigate/design';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { KeyboardInput } from '@/components/keyboard-scroll';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { formatPlate } from '@/lib/format';

import type { PlateEntry } from './use-plate-entry';

type Props = {
  entry: PlateEntry;
  /** True once the check is on record: the plate is then shown, not edited. */
  checked: boolean;
  /** The plate on the disc, shown only after the check so the guard reads the plate off the car, not the screen. */
  discPlate: string | null;
  /** The guard pressed Check with a plate that doesn't match the disc, and is being asked to look again. */
  lookAgain: boolean;
};

const THUMB_WIDTH = 76;
const THUMB_HEIGHT = 57;

/**
 * The plate on the car. The photo comes first: the reader fills in the plate and the guard confirms it. Typing is
 * always one tap away, for a dirty plate or a dark night, and either way the photo is kept with the check.
 */
export function PlateField({ entry, checked, discPlate, lookAgain }: Props) {
  if (checked) return <CheckedPlate entry={entry} discPlate={discPlate} />;

  if (!entry.photo && !entry.typing) {
    return (
      <View style={styles.field}>
        <Text variant="overline" color={colors.inkMuted}>
          Plate on the car
        </Text>
        <PillButton label="Photograph the plate" icon="camera" onPress={entry.openCamera} />
        <View style={styles.typeRow}>
          <Chip label="Type it instead" icon="edit" onPress={entry.startTyping} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text variant="overline" color={colors.inkMuted}>
        Plate on the car
      </Text>
      <View style={styles.inputRow}>
        {entry.photo ? (
          <Thumb photo={entry.photo} onPress={entry.openCamera} label="Retake the plate photo" />
        ) : (
          <IconButton icon="camera" label="Photograph the plate" size={THUMB_HEIGHT} onPress={entry.openCamera} />
        )}
        <KeyboardInput
          value={entry.plate}
          onChangeText={entry.setPlate}
          placeholder="Type the plate"
          placeholderTextColor={colors.inkSubtle}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          autoFocus={!entry.photo}
          maxLength={12}
          style={[styles.input, lookAgain && styles.inputLookAgain]}
          accessibilityLabel="Plate on the car"
        />
      </View>
      <Text variant="label" color={colors.inkMuted}>
        {entry.fromPhoto
          ? 'Read from the photo. Check it against the car.'
          : entry.photo
            ? 'Typed in. The photo is kept with the check.'
            : 'Typed in. Tap the camera to add a photo.'}
      </Text>
      {lookAgain ? (
        <ResultBanner
          tone="warning"
          title="Doesn't match the disc"
          message={
            entry.photo
              ? 'Look at the photo and the car again. Fix the plate if it was a slip. If it is right, press Check again.'
              : 'Look at the car again. Fix the plate if it was a slip. If it is right, press Check again.'
          }
        />
      ) : null}
    </View>
  );
}

function Thumb({ photo, onPress, label }: { photo: string; onPress?: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={label} style={styles.thumb}>
      <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={styles.fill} contentFit="cover" cachePolicy="none" />
    </Pressable>
  );
}

/** After the check: the plate the guard gave, with any character that isn't on the disc boxed, and the photo beside it. */
function CheckedPlate({ entry, discPlate }: { entry: PlateEntry; discPlate: string | null }) {
  const matches = discPlate !== null && entry.normalised === normaliseIdentifier(discPlate);
  const characters = discPlate && !matches ? plateDifferences(entry.plate, discPlate) : null;

  return (
    <View style={styles.field}>
      <Text variant="overline" color={colors.inkMuted}>
        Plate on the car
      </Text>
      <View style={styles.inputRow}>
        {entry.photo ? <Thumb photo={entry.photo} label="The plate photo, kept with this check" /> : null}
        <View style={styles.checkedPlate}>
          {characters ? (
            <View style={styles.characters} accessibilityLabel={`Plate given as ${entry.normalised}`}>
              {characters.map((character, index) => (
                <View key={index} style={[styles.character, character.differs && styles.characterDiffers]}>
                  <Text variant="title" color={character.differs ? colors.blocked : colors.ink}>
                    {character.character}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="title">{formatPlate(entry.normalised)}</Text>
          )}
        </View>
      </View>
      {discPlate ? (
        <View style={styles.typeRow}>
          {matches ? (
            <Chip label="Matches disc" icon="check" tone="clear" />
          ) : (
            <Chip label={`Disc says ${formatPlate(normaliseIdentifier(discPlate))}`} icon="result-blocked" tone="blocked" />
          )}
        </View>
      ) : null}
      {entry.warnedPlate !== null && entry.warnedPlate !== entry.normalised ? (
        <View style={styles.note}>
          <Icon name="edit" size={18} color={colors.inkMuted} />
          <Text variant="label" color={colors.inkMuted} style={styles.noteText}>
            {`Fixed from ${formatPlate(entry.warnedPlate)} after the disc check. Both are on record.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space.xs,
  },
  typeRow: {
    flexDirection: 'row',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  fill: {
    flex: 1,
  },
  input: {
    flex: 1,
    minHeight: THUMB_HEIGHT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.title,
    letterSpacing: 2,
  },
  inputLookAgain: {
    borderWidth: 2,
    borderColor: colors.warning,
  },
  checkedPlate: {
    flex: 1,
  },
  characters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  character: {
    minWidth: 24,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  characterDiffers: {
    borderColor: colors.blocked,
    backgroundColor: colors.blockedSoft,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  noteText: {
    flex: 1,
  },
});
