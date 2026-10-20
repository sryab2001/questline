// Day keys are local calendar dates ("YYYY-MM-DD") in the player's time zone,
// shifted by the reset hour: with resetHour = 4, 02:00 on the 10th still
// belongs to the 9th.

export type DayKey = string;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fromUtcDate(d: Date): DayKey {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toUtcDate(day: DayKey): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Wall-clock date and hour of `instant` in `timeZone`. */
function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

export function dayKey(instant: Date, timeZone: string, resetHour = 0): DayKey {
  const { year, month, day, hour } = localParts(instant, timeZone);
  const key = `${year}-${pad(month)}-${pad(day)}`;
  return hour < resetHour ? addDays(key, -1) : key;
}

export function addDays(day: DayKey, n: number): DayKey {
  const d = toUtcDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtcDate(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: DayKey): number {
  return toUtcDate(day).getUTCDay();
}

/** Inclusive list of days from `from` to `to`. Empty if `to` is before `from`. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
