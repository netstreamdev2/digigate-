import type { SignInResult } from './session';

export type PinProblem = {
  tone: 'warning' | 'blocked';
  title: string;
  message: string;
};

/**
 * A failed PIN check in the guard's words, with what to do next. `pinOnly`: they signed in with the PIN alone, so
 * there's no employee number to speak of.
 */
export function pinProblem(result: Exclude<SignInResult, { ok: true }>, pinOnly = false): PinProblem {
  if (result.reason === 'shared-pin') {
    return { tone: 'warning', title: 'Your employee number too', message: 'Another guard here has the same PIN. Type your employee number, then your PIN again.' };
  }
  if (result.reason === 'locked-out') {
    const time = new Date(result.retryAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    return pinOnly
      ? { tone: 'blocked', title: 'Locked out', message: `Three wrong PINs. Sign-in on this handheld opens again at ${time}.` }
      : { tone: 'blocked', title: 'Locked out', message: `Three wrong PINs. This employee number can try again after ${time}. A supervisor or another guard can still sign in with their own number.` };
  }
  const tries = `${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left`;
  return { tone: 'warning', title: 'Try again', message: pinOnly ? `That PIN isn't anyone's here. ${tries}.` : `That employee number and PIN don't match. ${tries}.` };
}
