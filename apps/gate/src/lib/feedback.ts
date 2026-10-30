import type { Outcome } from '@digigate/core';
import { Vibration } from 'react-native';

// Each result feels different in the hand, so the guard knows it without looking: one short tap, two taps, or
// three long buzzes. Tones join these with the next native build.
const PATTERNS: Record<Outcome, number[]> = {
  clear: [0, 60],
  warning: [0, 120, 90, 120],
  blocked: [0, 400, 120, 400, 120, 400],
};

export function signalOutcome(outcome: Outcome): void {
  Vibration.vibrate(PATTERNS[outcome]);
}
