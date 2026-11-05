import { File } from 'expo-file-system';

/** The smallest picture size whose short side is at least `shortSide` pixels: big enough for the job, quick to send. */
export function smallestPictureSize(sizes: readonly string[], shortSide: number): string | undefined {
  const usable = sizes.flatMap((size) => {
    const [width = 0, height = 0] = size.split('x').map(Number);
    return Math.min(width, height) >= shortSide ? [{ size, pixels: width * height }] : [];
  });
  return usable.sort((first, second) => first.pixels - second.pixels)[0]?.size;
}

/** The camera always leaves a copy in the app's cache, outside the encrypted database. A copy that won't delete stays private to the app until Android clears it. */
export function discardCameraFile(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    return;
  }
}
