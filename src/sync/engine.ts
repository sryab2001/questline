import { and, eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';

import { db, isTestWorld } from '@/db/client';
import { dayResults, settings } from '@/db/schema';

import { NetworkError, normalizeServerUrl, PbClient, PbError, type PbRecord } from './client';
import { setSyncStatus } from './status';
import { remoteUpdatedAt, SYNC_TABLES, type SyncTable, toLocal, toRemote } from './tables';

const KEY_SESSION = 'questline.sync.session';
const KEY_CURSORS = 'questline.sync.cursors';
const PAGE_SIZE = 500;

interface Session {
  serverUrl: string;
  token: string;
  userId: string;
  email: string;
}

/** Per-collection pull cursor: the newest server `updated` value seen. */
type Cursors = Record<string, string>;

// ---------- session storage ----------

export async function getSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY_SESSION);
  return raw ? (JSON.parse(raw) as Session) : null;
}

async function saveSession(s: Session) {
  await SecureStore.setItemAsync(KEY_SESSION, JSON.stringify(s));
  // Local-only column; not marked dirty.
  await db.update(settings).set({ serverUrl: s.serverUrl }).where(eq(settings.id, 'settings'));
}

async function getCursors(): Promise<Cursors> {
  const raw = await SecureStore.getItemAsync(KEY_CURSORS);
  return raw ? (JSON.parse(raw) as Cursors) : {};
}

async function saveCursors(c: Cursors) {
  await SecureStore.setItemAsync(KEY_CURSORS, JSON.stringify(c));
}

// ---------- public API ----------

export async function signIn(serverUrl: string, email: string, password: string) {
  if (isTestWorld()) throw new Error('Sync is disabled in the Test World.');
  const url = normalizeServerUrl(serverUrl);
  const auth = await new PbClient(url).authWithPassword(email.trim(), password);
  await saveSession({ serverUrl: url, token: auth.token, userId: auth.record.id, email: auth.record.email });
  // A new account or server means pulling everything from scratch.
  await saveCursors({});
  setSyncStatus({ signedIn: true, email: auth.record.email, serverUrl: url, error: null });
  return syncNow();
}

/** Loads the saved session into the status store at startup. */
export async function initSync() {
  const s = await getSession();
  setSyncStatus({ signedIn: !!s, email: s?.email ?? null, serverUrl: s?.serverUrl ?? null, pending: await countDirty() });
}

export async function signOut() {
  await SecureStore.deleteItemAsync(KEY_SESSION);
  await SecureStore.deleteItemAsync(KEY_CURSORS);
  setSyncStatus({ signedIn: false, email: null, serverUrl: null, state: 'idle', error: null });
}

let running: Promise<void> | null = null;
let again = false;

/** Pushes local changes, then pulls remote ones. Overlapping calls coalesce into one extra run. */
export function syncNow(): Promise<void> {
  // The Test World never talks to the server.
  if (isTestWorld()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---------- the sync itself ----------

async function runOnce() {
  const session = await getSession();
  if (!session) {
    setSyncStatus({ signedIn: false, state: 'idle' });
    return;
  }
  setSyncStatus({ signedIn: true, email: session.email, serverUrl: session.serverUrl, state: 'syncing', error: null });

  const client = new PbClient(session.serverUrl, session.token);
  try {
    const refreshed = await client.authRefresh();
    client.setToken(refreshed.token);
    await saveSession({ ...session, token: refreshed.token });

    let forceFullPull = false;
    for (const t of SYNC_TABLES) {
      forceFullPull = (await push(client, t, session.userId)) || forceFullPull;
    }

    const cursors = forceFullPull ? {} : await getCursors();
    for (const t of SYNC_TABLES) {
      const newest = await pull(client, t, cursors[t.name]);
      if (newest) cursors[t.name] = newest;
    }
    await saveCursors(cursors);

    setSyncStatus({ state: 'idle', lastSyncAt: Date.now(), error: null, pending: await countDirty() });
  } catch (e) {
    if (e instanceof NetworkError) {
      setSyncStatus({ state: 'offline', error: 'Server unreachable. Is Tailscale on?', pending: await countDirty() });
    } else if (e instanceof PbError && e.status === 401) {
      await SecureStore.deleteItemAsync(KEY_SESSION);
      setSyncStatus({ signedIn: false, state: 'error', error: 'Session expired. Sign in again.' });
    } else {
      setSyncStatus({ state: 'error', error: e instanceof Error ? e.message : String(e), pending: await countDirty() });
    }
  }
}

/** Uploads dirty rows of one table. Returns true if a full pull is needed afterwards. */
async function push(client: PbClient, t: SyncTable, userId: string): Promise<boolean> {
  const rows = (await db.select().from(t.table).where(eq(t.table.dirty, true))) as Record<string, unknown>[];
  let needFullPull = false;

  for (const row of rows) {
    const body = toRemote(t, row, userId);
    const remoteId = String(body.id);
    try {
      try {
        const { id: _id, ...patch } = body;
        await client.update(t.name, remoteId, patch);
      } catch (e) {
        if (!(e instanceof PbError && e.status === 404)) throw e;
        await client.create(t.name, body);
      }
    } catch (e) {
      // Another device already closed this day: drop ours and take theirs on the next pull.
      if (t.name === 'day_results' && e instanceof PbError && e.status === 400) {
        await db.delete(dayResults).where(eq(dayResults.id, String(row.id)));
        needFullPull = true;
        continue;
      }
      throw e;
    }
    // Only clear the flag if the row wasn't edited again while we were uploading.
    await db
      .update(t.table)
      .set({ dirty: false } as never)
      .where(and(eq(t.table.id, row.id as string), eq(t.table.updatedAt, row.updatedAt as Date)));
  }
  return needFullPull;
}

/** Downloads records changed since `since`. Returns the newest `updated` seen. */
async function pull(client: PbClient, t: SyncTable, since?: string): Promise<string | undefined> {
  const filter = since ? `updated >= "${since}"` : '';
  let newest = since;

  for (let page = 1; ; page++) {
    const res = await client.list(t.name, page, PAGE_SIZE, filter);
    for (const rec of res.items) {
      await applyRemote(t, rec);
      if (!newest || rec.updated > newest) newest = rec.updated;
    }
    if (page >= res.totalPages) break;
  }
  return newest;
}

async function applyRemote(t: SyncTable, rec: PbRecord) {
  const values = toLocal(t, rec);
  const id = String(values.id);
  const [local] = (await db.select().from(t.table).where(eq(t.table.id, id))) as Record<string, unknown>[];

  if (local) {
    const localAt = (local.updatedAt as Date).getTime();
    // Last write wins, by the client timestamp that made the change.
    if (local.dirty && localAt > remoteUpdatedAt(rec)) return;
    // Already have this version (e.g. our own push coming back): skip the write
    // so live queries don't fire and trigger yet another sync.
    if (!local.dirty && localAt === remoteUpdatedAt(rec)) return;
  }

  if (t.name === 'day_results') {
    // One result per day: replace a locally closed copy that has a different id.
    const day = String(values.day);
    const [clash] = await db.select({ id: dayResults.id }).from(dayResults).where(eq(dayResults.day, day));
    if (clash && clash.id !== id) await db.delete(dayResults).where(eq(dayResults.id, clash.id));
  }

  const { id: _id, ...rest } = values;
  await db
    .insert(t.table)
    .values(values as never)
    .onConflictDoUpdate({ target: t.table.id, set: rest as never });
}

async function countDirty() {
  let n = 0;
  for (const t of SYNC_TABLES) {
    n += (await db.select({ id: t.table.id }).from(t.table).where(eq(t.table.dirty, true))).length;
  }
  return n;
}
