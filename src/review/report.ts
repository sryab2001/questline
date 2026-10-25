// The weekly and Season AI reports are written on your server (server/pb_hooks) from
// the analysis the app computes; the app asks for one, reads the latest, and keeps a
// copy on the phone for offline reading.
import { readMeta, writeMeta } from '@/db/client';
import type { AnalysisPeriod, ReportInput } from '@/engine';
import { PbClient, PbError } from '@/sync/client';
import { getSession } from '@/sync/engine';

export interface WeeklyReport {
  period?: AnalysisPeriod;
  through: string;
  body: string;
  model: string;
  created: string;
}

const cacheKey = (period: AnalysisPeriod) => (period === 'week' ? 'ai_report' : 'ai_report_month');

export function cachedReport(period: AnalysisPeriod = 'week'): WeeklyReport | null {
  try {
    const raw = readMeta(cacheKey(period));
    return raw ? (JSON.parse(raw) as WeeklyReport) : null;
  } catch {
    return null;
  }
}

function cache(period: AnalysisPeriod, r: WeeklyReport) {
  writeMeta(cacheKey(period), JSON.stringify(r));
}

async function client() {
  const s = await getSession();
  if (!s) throw new Error('Sign in to your server (Settings → Sync) to use the AI report.');
  return { pb: new PbClient(s.serverUrl, s.token), userId: s.userId };
}

/** Asks the server to write a report now, from the analysis the app computed. */
export async function requestReport(period: AnalysisPeriod, input: ReportInput): Promise<WeeklyReport> {
  const { pb } = await client();
  try {
    const r = await pb.call<WeeklyReport>('POST', '/api/questline/report', { period, input });
    cache(period, r);
    return r;
  } catch (e) {
    if (e instanceof PbError && e.status === 404) throw new Error('Your server is older than this app. Upgrade it to use the AI report.');
    throw e;
  }
}

/** The newest report of a period on the server (e.g. Sunday's), cached locally; null if none. */
export async function fetchLatestReport(period: AnalysisPeriod = 'week'): Promise<WeeklyReport | null> {
  const { pb, userId } = await client();
  // Reports written before periods existed count as weekly.
  const filter = period === 'week' ? `owner = "${userId}" && (period = "week" || period = "")` : `owner = "${userId}" && period = "month"`;
  const res = await pb.call<{ items: WeeklyReport[] }>(
    'GET',
    `/api/collections/reports/records?perPage=1&sort=-created&filter=${encodeURIComponent(filter)}`,
    undefined,
    15_000,
  );
  const r = res.items[0] ?? null;
  if (r) cache(period, r);
  return r;
}
