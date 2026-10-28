import { createContext, useContext, type ReactNode } from 'react';

import type { LocalDatabase } from './database';

const LocalDatabaseContext = createContext<LocalDatabase | null>(null);

export function LocalDatabaseProvider({ database, children }: { database: LocalDatabase; children: ReactNode }) {
  return <LocalDatabaseContext.Provider value={database}>{children}</LocalDatabaseContext.Provider>;
}

export function useLocalDatabase(): LocalDatabase {
  const database = useContext(LocalDatabaseContext);
  if (!database) throw new Error('useLocalDatabase must be used inside LocalDatabaseProvider');
  return database;
}
