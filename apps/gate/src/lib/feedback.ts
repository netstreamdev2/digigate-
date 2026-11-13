import type { Outcome } from '@digigate/core';
import { Vibration } from 'react-native';

import { audioLibrary } from './native';

// Each result feels and sounds different, so the guard knows it without looking: one short tap, two taps, or three long
// buzzes, with a tone to match.
const PATTERNS: Record<Outcome, number[]> = {
  clear: [0, 60],
  warning: [0, 120, 90, 120],
  blocked: [0, 400, 120, 400, 120, 400],
};

const TONES: Record<Outcome, number> = {
  clear: require('../../assets/sounds/result-clear.wav'),
  warning: require('../../assets/sounds/result-warning.wav'),
  blocked: require('../../assets/sounds/result-blocked.wav'),
};

// The beep the moment DigiGate receives a scan, like a scanner's own good-read beep. DigiGate makes it, not the
// scanner, so it only sounds when the scan actually reached the app, and no scanner setting can switch it off.
const READ_TONE = require('../../assets/sounds/scan-read.wav');
const READ_BUZZ_MS = 25;

type Player = ReturnType<NonNullable<typeof audioLibrary>['createAudioPlayer']>;

let players: Record<Outcome, Player> | null = null;
let readPlayer: Player | null = null;

/** Loads the tones ahead of the first scan, so a sound never has to load while a result is showing. */
export async function prepareTones(): Promise<void> {
  if (!audioLibrary || players) return;
  await audioLibrary.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  players = {
    clear: audioLibrary.createAudioPlayer(TONES.clear),
    warning: audioLibrary.createAudioPlayer(TONES.warning),
    blocked: audioLibrary.createAudioPlayer(TONES.blocked),
  };
  readPlayer = audioLibrary.createAudioPlayer(READ_TONE);
}

/** A scan arrived: one short beep and the faintest tap, so the guard knows it read without looking. */
export function signalRead(): void {
  Vibration.vibrate(READ_BUZZ_MS);
  const player = readPlayer;
  if (!player) return;
  // A beep that fails changes nothing: the scan is already in.
  void player.seekTo(0).then(() => player.play(), () => undefined);
}

function playTone(outcome: Outcome): void {
  const player = players?.[outcome];
  if (!player) return;
  // The buzz has already gone, so a tone that fails is no reason to get in the way of the result.
  void player.seekTo(0).then(() => player.play(), () => undefined);
}

export function signalOutcome(outcome: Outcome): void {
  Vibration.vibrate(PATTERNS[outcome]);
  playTone(outcome);
}
