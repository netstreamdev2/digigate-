// Libraries whose native side a build might not have: importing one into an older build or Expo Go crashes the app at
// start-up. Everything that needs them comes through here and has a plain answer for when one is missing, so a gate keeps
// working without a selfie, a tone or a fence.

/** Null when this build doesn't carry the library. */
function optional<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

export const applicationLibrary = optional(() => require('expo-application') as typeof import('expo-application'));
export const audioLibrary = optional(() => require('expo-audio') as typeof import('expo-audio'));
export const batteryLibrary = optional(() => require('expo-battery') as typeof import('expo-battery'));
export const cameraLibrary = optional(() => require('expo-camera') as typeof import('expo-camera'));
export const locationLibrary = optional(() => require('expo-location') as typeof import('expo-location'));
export const netInfoLibrary = optional(() => require('@react-native-community/netinfo') as typeof import('@react-native-community/netinfo'));
export const taskManagerLibrary = optional(() => require('expo-task-manager') as typeof import('expo-task-manager'));
