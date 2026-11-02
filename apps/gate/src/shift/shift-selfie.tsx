import { colors, radius, space } from '@digigate/design';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import type { ShiftPhoto } from '@/db/shifts';
import { cameraLibrary } from '@/lib/native';

type Camera = NonNullable<typeof cameraLibrary>;
type CameraHandle = InstanceType<Camera['CameraView']>;

type Props = {
  onDone: (photo: ShiftPhoto) => void;
  onCancel: () => void;
};

const SMALLEST_SHORT_SIDE = 480;
const PHOTO_QUALITY = 0.5;

/** The smallest size that still shows a face clearly, so the photo is quick to send on a weak signal. */
function smallestGoodSize(sizes: readonly string[]): string | undefined {
  const usable = sizes.flatMap((size) => {
    const [width = 0, height = 0] = size.split('x').map(Number);
    return Math.min(width, height) >= SMALLEST_SHORT_SIDE ? [{ size, pixels: width * height }] : [];
  });
  return usable.sort((first, second) => first.pixels - second.pixels)[0]?.size;
}

/** The camera always leaves a copy in the app's cache, outside the encrypted database. A copy that won't delete stays private to the app until Android clears it. */
function discardCameraFile(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    return;
  }
}

/** The photo that goes with a shift, for people in the control room to look at. Nothing here reads the face. */
export function ShiftSelfie({ onDone, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Back" tone="dark" onPress={onCancel} />
      </View>
      <View style={styles.heading}>
        <Text variant="overline" color={colors.inkMuted}>
          Your shift photo
        </Text>
        <Text variant="display">Look at the camera</Text>
      </View>
      {cameraLibrary ? <CameraStep camera={cameraLibrary} onDone={onDone} /> : <NoCamera onDone={onDone} message="This build has no camera. " />}
    </View>
  );
}

function NoCamera({ message, onDone }: { message: string; onDone: Props['onDone'] }) {
  return (
    <>
      <View style={styles.middle}>
        <ResultBanner tone="warning" title="No photo" message={`${message}You can still go on duty, and your shift will show that it has no photo.`} />
      </View>
      <PillButton label="Start without a photo" onPress={() => onDone({ status: 'skipped' })} />
    </>
  );
}

function CameraStep({ camera: library, onDone }: { camera: Camera; onDone: Props['onDone'] }) {
  const [permission] = library.useCameraPermissions({ request: true });
  const camera = useRef<CameraHandle>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<string>();
  const [taking, setTaking] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const prepare = async () => {
    setReady(true);
    const sizes = await camera.current?.getAvailablePictureSizesAsync().catch(() => []);
    setSize(smallestGoodSize(sizes ?? []));
  };

  const take = async () => {
    setTaking(true);
    try {
      const picture = await camera.current?.takePictureAsync({ quality: PHOTO_QUALITY, base64: true, shutterSound: false });
      if (picture) discardCameraFile(picture.uri);
      if (picture?.base64) setPhoto(picture.base64);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setTaking(false);
    }
  };

  const retake = () => {
    setPhoto(null);
    setReady(false);
  };

  if (permission?.status === 'denied') return <NoCamera onDone={onDone} message="DigiGate isn't allowed to use the camera. Tell your supervisor. " />;
  if (failed) return <NoCamera onDone={onDone} message="The camera didn't work. " />;

  if (photo) {
    return (
      <>
        <View style={styles.frame}>
          <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={styles.fill} contentFit="cover" cachePolicy="none" />
        </View>
        <View style={styles.actions}>
          <PillButton label="Use this photo" onPress={() => onDone({ status: 'taken', jpegBase64: photo })} />
          <PillButton label="Retake" variant="secondary" onPress={retake} />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.frame}>
        {permission?.granted ? (
          <library.CameraView
            ref={camera}
            style={styles.fill}
            facing="front"
            mode="picture"
            animateShutter={false}
            pictureSize={size}
            onCameraReady={prepare}
            onMountError={() => setFailed(true)}
          />
        ) : null}
      </View>
      <PillButton label={taking ? 'Taking…' : 'Take photo'} disabled={!ready || taking} onPress={take} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space.lg,
    gap: space.lg,
    backgroundColor: colors.background,
  },
  topBar: {
    height: 56,
    justifyContent: 'center',
  },
  heading: {
    gap: space.xs,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  frame: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  fill: {
    flex: 1,
  },
  actions: {
    gap: space.sm,
  },
});
