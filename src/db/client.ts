import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// enableChangeListener lets Drizzle's useLiveQuery re-render screens on writes.
const sqlite = openDatabaseSync('questline.db', { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
