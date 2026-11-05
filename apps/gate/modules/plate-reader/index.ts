import { NativeModule, requireOptionalNativeModule } from 'expo';

export type NativeReadLine = { text: string; height: number };

declare class PlateReaderNativeModule extends NativeModule<Record<string, never>> {
  /** Loads the text model ahead of the first photo. */
  prepare(): void;
  /** Every line of text in the photo at `uri`, read on the device, with each line's height in pixels. */
  readLines(uri: string): Promise<NativeReadLine[]>;
}

// Null in Expo Go and in builds made before this module existed: the guard then types the plate, and the photo is still kept.
export const PlateReader = requireOptionalNativeModule<PlateReaderNativeModule>('PlateReader');
