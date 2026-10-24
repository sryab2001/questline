// The weekly AI report is written on your server (server/pb_hooks); the app asks for
// one, reads the latest, and keeps a copy on the phone for offline reading.
import { readMeta, writeMeta } from '@/db/client';
import { PbClient, PbError } from '@/sync/client';
import { getSession } from '@/sync/engine';

export interface WeeklyReport {
  through: string;
  body: string;
  model: string;
  created: string;
}

const CACHE_KEY = 'ai_report';

export function cachedReport(): WeeklyReport | null {
  try {
    const raw = readMeta(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WeeklyReport) : null;
  } catch {
    return null;
  }
}

function cache(r: WeeklyReport) {
  writeMeta(CACHE_KEY, JSON.stringify(r));
}

async function client() {
  const s = await getSession();
  if (!s) throw new Error('Sign in to your server (Settings → Sync) to use the AI report.');
  return { pb: new PbClient(s.serverUrl, s.token), userId: s.userId };
}

/** Asks the server to write a report now. */
export async function requestReport(): Promise<WeeklyReport> {
  const { pb } = await client();
  try {
    const r = await pb.call<WeeklyReport>('POST', '/api/questline/report');
    cache(r);
    return r;
  } catch (e) {
    if (e instanceof PbError && e.status === 404) throw new Error('Your server is older than this app. Upgrade it to use the AI report.');
    throw e;
  }
}

/** The newest report on the server (e.g. Sunday's), cached locally; null if none yet. */
export async function fetchLatestReport(): Promise<WeeklyReport | null> {
  const { pb, userId } = await client();
  const res = await pb.call<{ items: WeeklyReport[] }>(
    'GET',
    `/api/collections/reports/records?perPage=1&sort=-created&filter=${encodeURIComponent(`owner = "${userId}"`)}`,
    undefined,
    15_000,
  );
  const r = res.items[0] ?? null;
  if (r) cache(r);
  return r;
}
