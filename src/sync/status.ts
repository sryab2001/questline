import { useSyncExternalStore } from 'react';

export interface SyncStatus {
  signedIn: boolean;
  email: string | null;
  serverUrl: string | null;
  state: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt: number | null;
  /** Local changes not yet on the server. */
  pending: number;
  error: string | null;
}

let status: SyncStatus = {
  signedIn: false,
  email: null,
  serverUrl: null,
  state: 'idle',
  lastSyncAt: null,
  pending: 0,
  error: null,
};

const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}
