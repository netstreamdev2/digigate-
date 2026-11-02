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

type Player = ReturnType<NonNullable<typeof audioLibrary>['createAudioPlayer']>;

let players: Record<Outcome, Player> | null = null;

/** Loads the tones ahead of the first scan, so a sound never has to load while a result is showing. */
export async function prepareTones(): Promise<void> {
  if (!audioLibrary || players) return;
  await audioLibrary.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  players = {
    clear: audioLibrary.createAudioPlayer(TONES.clear),
    warning: audioLibrary.createAudioPlayer(TONES.warning),
    blocked: audioLibrary.createAudioPlayer(TONES.blocked),
  };
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
