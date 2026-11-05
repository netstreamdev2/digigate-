import { plateReadings } from '@digigate/core';
import { colors, radius, space } from '@digigate/design';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { discardCameraFile, smallestPictureSize } from '@/lib/camera-files';
import { formatPlate } from '@/lib/format';
import { cameraLibrary } from '@/lib/native';

import { PlateReader } from '../../modules/plate-reader';

type Camera = NonNullable<typeof cameraLibrary>;
type CameraHandle = InstanceType<Camera['CameraView']>;

type Props = {
  /** The guard took a photo and confirmed what was read off it. */
  onUse: (photo: string, plate: string) => void;
  /** The guard will type the plate, starting from `startFrom` when the reading was nearly right. The photo, when there is one, is kept as evidence. */
  onType: (photo: string | null, readFromPhoto: string | null, startFrom: string | null) => void;
  onCancel: () => void;
};

/** Big enough to read a plate from a car length away, small enough to send on a weak signal. */
const SMALLEST_SHORT_SIDE = 960;
const PHOTO_QUALITY = 0.6;
/** A South African plate is about four and a half times as wide as it is tall. */
const PLATE_ASPECT = 4.6;
const SHUTTER_SIZE = 76;

type Review = { photo: string; readings: string[]; readable: boolean };

/**
 * The photo of the car's number plate, which is how the guard gives the plate: the reader fills it in and the guard
 * confirms it against the photo. The photo is kept with the check, so a slip at the gate can be told from a real
 * mismatch later. Nothing animates: the photo and the reading are on screen the moment they exist.
 */
export function PlateCamera({ onUse, onType, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Back" onPress={onCancel} />
        <Chip label="Number plate" icon="number-plate" />
      </View>
      {cameraLibrary ? (
        <CameraStep camera={cameraLibrary} onUse={onUse} onType={onType} />
      ) : (
        <NoCamera message="This build has no camera. " onType={() => onType(null, null, null)} />
      )}
    </View>
  );
}

function NoCamera({ message, onType }: { message: string; onType: () => void }) {
  return (
    <>
      <View style={styles.middle}>
        <ResultBanner tone="warning" title="No plate photo" message={`${message}Type the plate off the car instead. The check works the same.`} />
      </View>
      <PillButton label="Type the plate" icon="edit" onPress={onType} />
    </>
  );
}

function CameraStep({ camera: library, onUse, onType }: { camera: Camera } & Pick<Props, 'onUse' | 'onType'>) {
  const [permission] = library.useCameraPermissions({ request: true });
  const camera = useRef<CameraHandle>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<string>();
  const [torch, setTorch] = useState(false);
  const [taking, setTaking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [failed, setFailed] = useState(false);

  // The reading model loads while the guard lines up the shot, so the first photo reads as quickly as the rest.
  useEffect(() => {
    try {
      PlateReader?.prepare();
    } catch {
      return;
    }
  }, []);

  const prepare = async () => {
    setReady(true);
    const sizes = await camera.current?.getAvailablePictureSizesAsync().catch(() => []);
    setSize(smallestPictureSize(sizes ?? [], SMALLEST_SHORT_SIDE));
  };

  const take = async () => {
    setTaking(true);
    try {
      const picture = await camera.current?.takePictureAsync({ quality: PHOTO_QUALITY, base64: true, shutterSound: false });
      if (!picture?.base64) {
        if (picture) discardCameraFile(picture.uri);
        setFailed(true);
        return;
      }
      // A photo the reader can't open still counts: the guard types the plate and the photo is kept.
      const lines = PlateReader ? await PlateReader.readLines(picture.uri).catch(() => null) : null;
      discardCameraFile(picture.uri);
      setReview({ photo: picture.base64, readings: lines ? plateReadings(lines) : [], readable: lines !== null });
    } catch {
      setFailed(true);
    } finally {
      setTaking(false);
    }
  };

  const retake = () => {
    setReview(null);
    setReady(false);
  };

  if (permission?.status === 'denied') return <NoCamera message="DigiGate isn't allowed to use the camera. Tell your supervisor. " onType={() => onType(null, null, null)} />;
  if (failed) return <NoCamera message="The camera didn't work. " onType={() => onType(null, null, null)} />;
  if (review) return <ReviewStep review={review} onUse={onUse} onType={onType} onRetake={retake} />;

  return (
    <>
      <View style={styles.heading}>
        <Text variant="display">Photograph the plate</Text>
        <Text variant="label" color={colors.inkMuted}>
          Fill the box with the number plate on the car, not the disc.
        </Text>
      </View>
      <View style={styles.viewfinder}>
        {permission?.granted ? (
          <library.CameraView
            ref={camera}
            style={styles.fill}
            facing="back"
            mode="picture"
            animateShutter={false}
            enableTorch={torch}
            pictureSize={size}
            onCameraReady={prepare}
            onMountError={() => setFailed(true)}
          />
        ) : null}
        <View style={styles.guideArea} pointerEvents="none">
          <View style={styles.guide} />
        </View>
      </View>
      <View style={styles.controls}>
        <View style={styles.side}>
          <Chip label={torch ? 'Torch on' : 'Torch off'} tone={torch ? 'selected' : 'neutral'} onPress={() => setTorch(!torch)} />
        </View>
        <Pressable
          onPress={take}
          disabled={!ready || taking}
          accessibilityRole="button"
          accessibilityLabel="Take the plate photo"
          accessibilityState={{ disabled: !ready || taking, busy: taking }}
          style={({ pressed }) => [styles.shutter, (!ready || taking) && styles.shutterWaiting, pressed && styles.pressed]}>
          <View style={styles.shutterCore} />
        </Pressable>
        <View style={[styles.side, styles.sideEnd]}>
          <Chip label="Type it" icon="edit" onPress={() => onType(null, null, null)} />
        </View>
      </View>
      <Text variant="label" color={colors.inkMuted} style={styles.centred}>
        {taking ? 'Reading the plate…' : ' '}
      </Text>
    </>
  );
}

function ReviewStep({ review, onUse, onType, onRetake }: { review: Review; onRetake: () => void } & Pick<Props, 'onUse' | 'onType'>) {
  const [first] = review.readings;
  const [chosen, setChosen] = useState<string | null>(first ?? null);
  const others = review.readings.filter((reading) => reading !== chosen);

  return (
    <>
      <View style={styles.photo}>
        <Image source={{ uri: `data:image/jpeg;base64,${review.photo}` }} style={styles.fill} contentFit="cover" cachePolicy="none" />
      </View>

      {chosen ? (
        <View style={styles.reading}>
          <Text variant="overline" color={colors.inkMuted}>
            Read from the photo
          </Text>
          <View style={styles.plate} accessibilityLabel={`Plate read as ${chosen}`}>
            <Text variant="display" style={styles.plateText}>
              {formatPlate(chosen)}
            </Text>
          </View>
          <Text variant="label" color={colors.inkMuted}>
            Check every letter against the photo and the car.
          </Text>
          {others.length > 0 ? (
            <View style={styles.others}>
              <Text variant="label" color={colors.inkMuted}>
                Or was it:
              </Text>
              {others.map((reading) => (
                <Chip key={reading} label={formatPlate(reading)} onPress={() => setChosen(reading)} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <ResultBanner
          tone="warning"
          title="Couldn't read the plate"
          message={
            review.readable
              ? 'Retake it closer and straight on, or type the plate. The photo is kept either way.'
              : "This handheld can't read photos yet. Type the plate off the car. The photo is kept."
          }
        />
      )}

      <View style={styles.actions}>
        {chosen ? <PillButton label={`Use ${formatPlate(chosen)}`} icon="check" onPress={() => onUse(review.photo, chosen)} /> : null}
        <View style={styles.actionRow}>
          <View style={styles.actionHalf}>
            <PillButton label="Retake" icon="rescan" variant="secondary" onPress={onRetake} />
          </View>
          <View style={styles.actionHalf}>
            <PillButton label={chosen ? 'Fix it' : 'Type it'} icon="edit" variant="secondary" onPress={() => onType(review.photo, first ?? null, chosen)} />
          </View>
        </View>
      </View>
    </>
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
    gap: space.lg,
    backgroundColor: colors.background,
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
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  viewfinder: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  fill: {
    flex: 1,
  },
  guideArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    width: '86%',
    aspectRatio: PLATE_ASPECT,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.inkInverse,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'flex-start',
  },
  sideEnd: {
    alignItems: 'flex-end',
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterWaiting: {
    borderColor: colors.inkSubtle,
  },
  shutterCore: {
    width: SHUTTER_SIZE - 18,
    height: SHUTTER_SIZE - 18,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  pressed: {
    opacity: 0.7,
  },
  centred: {
    textAlign: 'center',
  },
  photo: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  reading: {
    gap: space.xs,
  },
  plate: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.tileButter,
  },
  plateText: {
    letterSpacing: 3,
  },
  others: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.xs,
  },
  actions: {
    marginTop: 'auto',
    gap: space.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  actionHalf: {
    flex: 1,
  },
});
