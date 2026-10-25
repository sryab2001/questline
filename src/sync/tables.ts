import { getTableColumns } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import * as schema from '@/db/schema';

import type { PbRecord } from './client';

export interface SyncTable {
  /** PocketBase collection name = SQLite table name. */
  name: string;
  table: SQLiteTable & { id: SQLiteColumn; updatedAt: SQLiteColumn; dirty: SQLiteColumn };
  /** JS keys that never leave the device. */
  localOnly: string[];
  /** Local id → remote id (settings is a singleton locally, per-user remotely). */
  toRemoteId: (id: string, userId: string) => string;
  toLocalId: (id: string) => string;
}

const same = (id: string) => id;

function table(name: string, t: SyncTable['table'], localOnly: string[] = []): SyncTable {
  return { name, table: t, localOnly, toRemoteId: same, toLocalId: same };
}

/** Synced tables in push order (parents before children). */
export const SYNC_TABLES: SyncTable[] = [
  {
    ...table('settings', schema.settings, ['serverUrl', 'lastPullAt']),
    toRemoteId: (_id, userId) => `settings-${userId}`,
    toLocalId: () => 'settings',
  },
  table('habits', schema.habits),
  table('logs', schema.logs),
  table('day_results', schema.dayResults),
  table('stat_allocations', schema.statAllocations),
  table('store_items', schema.storeItems),
  table('purchases', schema.purchases),
  table('skill_uses', schema.skillUses),
  table('unlocks', schema.unlocks),
  table('class_quests', schema.classQuests),
  table('checkins', schema.checkins),
  table('events', schema.events),
  table('routines', schema.routines),
  table('journal', schema.journal),
];

const SKIP = new Set(['dirty']);

/** Local row → PocketBase body (snake_case, dates as ms, null as 0/''). */
export function toRemote(t: SyncTable, row: Record<string, unknown>, userId: string): Record<string, unknown> {
  const body: Record<string, unknown> = { owner: userId };
  for (const [key, col] of Object.entries(getTableColumns(t.table))) {
    if (SKIP.has(key) || t.localOnly.includes(key)) continue;
    const v = row[key];
    if (key === 'id') {
      body.id = t.toRemoteId(String(v), userId);
    } else if (col.dataType === 'date') {
      body[col.name] = v instanceof Date ? v.getTime() : 0;
    } else if (v === null || v === undefined) {
      body[col.name] = col.dataType === 'number' ? 0 : col.dataType === 'boolean' ? false : '';
    } else {
      body[col.name] = v;
    }
  }
  return body;
}

/** PocketBase record → local row values (clean, i.e. not dirty). */
export function toLocal(t: SyncTable, rec: PbRecord): Record<string, unknown> {
  const row: Record<string, unknown> = { dirty: false };
  for (const [key, col] of Object.entries(getTableColumns(t.table))) {
    if (SKIP.has(key) || t.localOnly.includes(key)) continue;
    if (key === 'id') {
      row.id = t.toLocalId(rec.id);
      continue;
    }
    const v = rec[col.name];
    // PocketBase stores "no value" as 0 / ''; nullable columns get null back.
    const empty =
      v === undefined || v === null || v === '' || ((col.dataType === 'date' || col.dataType === 'number') && v === 0);
    if (empty && !col.notNull) {
      row[key] = null;
    } else if (col.dataType === 'date') {
      row[key] = new Date(Number(v ?? 0));
    } else if (col.dataType === 'boolean') {
      row[key] = Boolean(v);
    } else if (col.dataType === 'number') {
      row[key] = Number(v ?? 0);
    } else {
      row[key] = v ?? '';
    }
  }
  return row;
}

/** Client-side last-modified time of a remote record, for last-write-wins. */
export function remoteUpdatedAt(rec: PbRecord): number {
  return Number(rec.updated_at ?? 0);
}
