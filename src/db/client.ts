import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import * as schema from './schema';

/**
 * Two worlds: your real data, and a Test World (a separate, pre-filled database
 * that never syncs). The choice lives in a tiny meta database so it can be read
 * synchronously at startup.
 */
export type World = 'real' | 'test';

const FILES: Record<World, string> = { real: 'questline.db', test: 'questline-test.db' };

const meta = openDatabaseSync('questline-meta.db');
meta.execSync('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const saved = meta.getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = 'world'")?.value;

function open(world: World) {
  // enableChangeListener lets Drizzle's useLiveQuery re-render screens on writes.
  const sqlite = openDatabaseSync(FILES[world], { enableChangeListener: true });
  sqlite.execSync('PRAGMA journal_mode = WAL;');
  return drizzle(sqlite, { schema });
}

let world: World = saved === 'test' ? 'test' : 'real';
let current = open(world);
const listeners = new Set<() => void>();

export type Db = typeof current;

/** Always points at the active world's database. */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const value = Reflect.get(current, prop);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export function currentWorld(): World {
  return world;
}

export function isTestWorld() {
  return world === 'test';
}

/** Switches databases. The root layout remounts on change, re-running migrations. */
export function switchWorld(next: World) {
  if (next === world) return;
  meta.runSync("INSERT OR REPLACE INTO kv (key, value) VALUES ('world', ?)", next);
  world = next;
  current = open(next);
  listeners.forEach((l) => l());
}

export function useWorld(): World {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => world,
  );
}
