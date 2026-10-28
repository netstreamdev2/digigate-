import { uuidv7 } from '@digigate/core';
import { getRandomBytes } from 'expo-crypto';

export function newEventId(now: number = Date.now()): string {
  return uuidv7(now, getRandomBytes(10));
}
