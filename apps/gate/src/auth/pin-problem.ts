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
    return { tone: 'blocked', title: 'Locked out', message: `Too many wrong PINs. Try again after ${time}, or ask a supervisor.` };
  }
  const tries = `${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left`;
  return { tone: 'warning', title: 'Try again', message: `That employee number and PIN don't match. ${tries}.` };
}
