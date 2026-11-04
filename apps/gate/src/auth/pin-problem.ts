import type { SignInResult } from './session';

export type PinProblem = {
  tone: 'warning' | 'blocked';
  title: string;
  message: string;
};

/** A failed PIN check in the guard's words, with what to do next. */
export function pinProblem(result: Exclude<SignInResult, { ok: true }>): PinProblem {
  if (result.reason === 'locked-out') {
    const time = new Date(result.retryAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    return { tone: 'blocked', title: 'Locked out', message: `Three wrong PINs. This employee number can try again after ${time}. A supervisor or another guard can still sign in with their own number.` };
  }
  const tries = `${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left`;
  return { tone: 'warning', title: 'Try again', message: `That employee number and PIN don't match. ${tries}.` };
}
