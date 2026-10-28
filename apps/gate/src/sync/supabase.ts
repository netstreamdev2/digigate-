import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getValue, removeValue, setValue } from '@/db/kv';

import type { Database } from './database-types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const AUTH_KEY_PREFIX = 'auth:';

export type GateSupabase = SupabaseClient<Database>;

/** Null when the build has no Supabase settings; the app then runs on its local data alone. */
export function createGateSupabase(db: SQLiteDatabase): GateSupabase | null {
  if (!url || !publishableKey) return null;
  return createClient<Database>(url, publishableKey, {
    auth: {
      // The device's session lives in the encrypted local database rather than plain storage.
      storage: {
        getItem: (key) => getValue(db, `${AUTH_KEY_PREFIX}${key}`),
        setItem: (key, value) => setValue(db, `${AUTH_KEY_PREFIX}${key}`, value),
        removeItem: (key) => removeValue(db, `${AUTH_KEY_PREFIX}${key}`),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
