// Hunter Analysis: deterministic patterns from your history, with the numbers behind
// each one. The weekly and monthly AI reports only explain these findings; they never
// compute anything themselves (the pilot showed models get arithmetic wrong).
import { addDays, type DayKey, daysBetween, weekday } from './day';
import { WEEKDAY_NAMES } from './review';
import type { DayKind, DaySummary } from './types';

const KEPT: DayKind[] = ['cleared', 'min'];
const baseName = (n: string) => n.replace(/ \(minimum\)$/, '');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const round1 = (x: number) => Math.round(x * 10) / 10;

export type AnalysisPeriod = 'week' | 'month';

export interface AnalysisInput {
  period: AnalysisPeriod;
  /** First and last day the report is about. */
  from: DayKey;
  to: DayKey;
  today: DayKey;
  history: DaySummary[];
  habits: { id: string; name: string; limit?: boolean; archived: boolean; unit: string; target: number }[];
  /** Current habit strength by habit id. */
  strength: Record<string, number>;
  /** When each log was written: local hour 0–23. */
  logTimes: { habitId: string; day: DayKey; hour: number }[];
  journal: { day: DayKey; mood: number | null; energy: number | null }[];
  mainQuests: { name: string; doneDays: DayKey[]; remaining: number }[];
  streak: number;
  longestStreak: number;
}

export interface HabitAnalysis {
  name: string;
  limit: boolean;
  /** Share of scheduled days kept (minimum counts), whole analysis window. */
  rate: number;
  /** Same, inside the report period. */
  periodKept: number;
  periodDays: number;
  minimumShare: number;
  strengthNow: number;
  strengthBefore: number | null;
  bestDay: string | null;
  worstDay: string | null;
  /** Usual two-hour window and how often it's used, if there's a clear one. */
  timeWindow: { label: string; share: number } | null;
}

export interface Insight {
  kind: 'streak' | 'trend' | 'weekday' | 'time' | 'pair' | 'screen' | 'recovery' | 'minimum' | 'mood' | 'mainQuest';
  text: string;
  /** Higher = more important; insights are sorted by it. */
  weight: number;
}

export interface Analysis {
  period: AnalysisPeriod;
  from: DayKey;
  to: DayKey;
  overview: {
    daysKept: number;
    days: number;
    previousRate: number | null;
    streak: number;
    longestStreak: number;
    gatesLast4Weeks: number;
  };
  habits: HabitAnalysis[];
  pairs: { anchor: string; follower: string; withAnchor: number; without: number }[];
  screenTime: { name: string; overDays: number; missedWhenOver: number; missedWhenUnder: number } | null;
  recovery: { slips: number; recovered: number } | null;
  mood: { average: number | null; entries: number; byHabit: { name: string; kept: number; missed: number }[] };
  mainQuests: { name: string; perWeek: number; remaining: number; eta: DayKey | null }[];
  insights: Insight[];
}

interface DayStatus {
  day: DayKey;
  kind: DayKind;
  done: Set<string>;
  min: Set<string>;
  missed: Set<string>;
}

function statuses(history: DaySummary[], from: DayKey, to: DayKey): DayStatus[] {
  return history
    .filter((d) => d.day >= from && d.day <= to && d.kind !== 'empty' && d.kind !== 'rested')
    .map((d) => ({
      day: d.day,
      kind: d.kind,
      done: new Set(d.done.map(baseName)),
      min: new Set(d.done.filter((n) => n !== baseName(n)).map(baseName)),
      missed: new Set(d.missed),
    }));
}

const keptOn = (s: DayStatus, name: string) => s.done.has(name);
const scheduledOn = (s: DayStatus, name: string) => s.done.has(name) || s.missed.has(name);

const hourLabel = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

export function analyze(input: AnalysisInput): Analysis {
  const { history, from, to, today } = input;
  const length = daysBetween(from, to) + 1;
  // Patterns need more data than one week: look back 4 weeks (weekly) or 8 (monthly).
  const windowFrom = addDays(to, -(input.period === 'month' ? 55 : 27));
  const weeks = input.period === 'month' ? 8 : 4;
  const window = statuses(history, windowFrom, to);
  const period = statuses(history, from, to);
  const previous = statuses(history, addDays(from, -length), addDays(from, -1));
  const insights: Insight[] = [];

  // ---------- overview ----------
  const daysKept = period.filter((s) => KEPT.includes(s.kind)).length;
  const prevRate = previous.length ? previous.filter((s) => KEPT.includes(s.kind)).length / previous.length : null;
  const gatesLast4Weeks = history.filter((d) => d.gateCleared && d.day > addDays(to, -28) && d.day <= to).length;
  const overview = { daysKept, days: period.length, previousRate: prevRate, streak: input.streak, longestStreak: input.longestStreak, gatesLast4Weeks };
  if (input.streak > 0 && input.longestStreak - input.streak <= 5 && input.longestStreak > input.streak) {
    insights.push({ kind: 'streak', text: `Streak ${input.streak} days, ${input.longestStreak - input.streak} short of your record (${input.longestStreak}).`, weight: 6 });
  } else if (input.streak > 0 && input.streak === input.longestStreak && input.streak >= 7) {
    insights.push({ kind: 'streak', text: `Streak ${input.streak} days: a new personal record.`, weight: 7 });
  }

  // ---------- per habit ----------
  const strengthBefore = new Map<string, number>();
  for (const d of history) {
    if (d.day < windowFrom || d.day > to) continue;
    for (const c of d.strength) if (!strengthBefore.has(c.habitId)) strengthBefore.set(c.habitId, c.before);
  }
  const habits: HabitAnalysis[] = [];
  for (const h of input.habits.filter((x) => !x.archived)) {
    const sched = window.filter((s) => scheduledOn(s, h.name));
    if (sched.length === 0) continue;
    const kept = sched.filter((s) => keptOn(s, h.name));
    const byDay = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
      const days = sched.filter((s) => weekday(s.day) === wd);
      return { wd, n: days.length, rate: days.length ? days.filter((s) => keptOn(s, h.name)).length / days.length : 0 };
    });
    const eligible = byDay.filter((x) => x.n >= 2);
    const best = eligible.length >= 3 ? eligible.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
    const worst = eligible.length >= 3 ? eligible.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;

    // Usual time: the two-hour window holding the most of this habit's logs.
    let timeWindow: HabitAnalysis['timeWindow'] = null;
    const hours = input.logTimes.filter((l) => l.habitId === h.id && l.day >= windowFrom && l.day <= to).map((l) => l.hour);
    if (!h.limit && hours.length >= 6) {
      let bestH = 0;
      let bestN = -1;
      for (let s = 0; s < 24; s++) {
        const n = hours.filter((x) => x === s || x === (s + 1) % 24).length;
        if (n > bestN) [bestH, bestN] = [s, n];
      }
      timeWindow = { label: `${hourLabel(bestH)}–${hourLabel(bestH + 2)}`, share: bestN / hours.length };
    }

    const p = period.filter((s) => scheduledOn(s, h.name));
    const a: HabitAnalysis = {
      name: h.name,
      limit: !!h.limit,
      rate: kept.length / sched.length,
      periodKept: p.filter((s) => keptOn(s, h.name)).length,
      periodDays: p.length,
      minimumShare: kept.length ? kept.filter((s) => s.min.has(h.name)).length / kept.length : 0,
      strengthNow: Math.round(input.strength[h.id] ?? 0),
      strengthBefore: strengthBefore.has(h.id) ? Math.round(strengthBefore.get(h.id)!) : null,
      bestDay: best && best.rate > (worst?.rate ?? 0) ? WEEKDAY_NAMES[best.wd] : null,
      worstDay: worst && worst.rate <= 0.6 && worst.rate < (best?.rate ?? 1) ? WEEKDAY_NAMES[worst.wd] : null,
      timeWindow,
    };
    habits.push(a);

    if (a.strengthBefore !== null && a.strengthBefore - a.strengthNow >= 5) {
      insights.push({ kind: 'trend', text: `${h.name} strength fell ${a.strengthBefore} → ${a.strengthNow} over the last ${weeks} weeks.`, weight: 7 });
    }
    // A Limit Quest's bad days are covered by the screen-time finding.
    if (a.worstDay && sched.length >= 10 && !h.limit) {
      const wd = WEEKDAY_NAMES.indexOf(a.worstDay);
      const d = byDay[wd];
      insights.push({ kind: 'weekday', text: `${h.name} is weakest on ${a.worstDay}s: kept ${Math.round(d.rate * d.n)} of ${d.n}.`, weight: 6 });
    }
    if (timeWindow && timeWindow.share >= 0.7) {
      insights.push({ kind: 'time', text: `${h.name} happens ${timeWindow.label} on ${pct(timeWindow.share)} of days: a fixed slot.`, weight: 2 });
    } else if (timeWindow && timeWindow.share < 0.45 && a.rate < 0.75) {
      insights.push({ kind: 'time', text: `${h.name} has no fixed time (best window ${timeWindow.label} only ${pct(timeWindow.share)}) and is kept ${pct(a.rate)}: give it a set slot.`, weight: 6 });
    }
    if (!h.limit && kept.length >= 6 && a.minimumShare >= 0.4) {
      insights.push({ kind: 'minimum', text: `${h.name} ended on the minimum ${pct(a.minimumShare)} of kept days: the full target may be too high.`, weight: 5 });
    }
  }

  // Rising strength is good news but repetitive: one line for all of it.
  const rising = habits.filter((h) => h.strengthBefore !== null && h.strengthNow - h.strengthBefore >= 5);
  if (rising.length === 1) {
    const h = rising[0];
    insights.push({ kind: 'trend', text: `${h.name} strength rose ${h.strengthBefore} → ${h.strengthNow} over the last ${weeks} weeks.`, weight: 3 });
  } else if (rising.length > 1) {
    const avg = Math.round(rising.reduce((t, h) => t + h.strengthNow - h.strengthBefore!, 0) / rising.length);
    insights.push({ kind: 'trend', text: `Strength rose on ${rising.length} quests over the last ${weeks} weeks (+${avg} on average): ${rising.map((h) => h.name).join(', ')}.`, weight: 3 });
  }

  // ---------- habits that travel together ----------
  const pairs: Analysis['pairs'] = [];
  // A day where none of your other habits happened either (sick, travelling) says nothing
  // about how two habits relate. Judged by the habits outside the pair, when there are any.
  const doableNames = habits.filter((x) => !x.limit).map((x) => x.name);
  const ordinaryDay = (s: DayStatus, a: string, b: string) => {
    const others = doableNames.filter((n) => n !== a && n !== b && scheduledOn(s, n));
    return others.length === 0 || others.some((n) => keptOn(s, n));
  };
  // Each pair once: the more consistently kept habit is the anchor the other one leans on.
  const doable = habits.filter((x) => !x.limit).sort((a, b) => b.rate - a.rate);
  for (let i = 0; i < doable.length; i++) {
    for (let j = i + 1; j < doable.length; j++) {
      const anchor = doable[i].name;
      const follower = doable[j].name;
      const both = window.filter((s) => ordinaryDay(s, anchor, follower) && scheduledOn(s, anchor) && scheduledOn(s, follower));
      const withA = both.filter((s) => keptOn(s, anchor));
      const withoutA = both.filter((s) => !keptOn(s, anchor));
      if (withA.length < 5 || withoutA.length < 3) continue;
      const p1 = withA.filter((s) => keptOn(s, follower)).length / withA.length;
      const p0 = withoutA.filter((s) => keptOn(s, follower)).length / withoutA.length;
      if (p1 - p0 >= 0.25) pairs.push({ anchor, follower, withAnchor: p1, without: p0 });
    }
  }
  pairs.sort((a, b) => b.withAnchor - b.without - (a.withAnchor - a.without));
  for (const p of pairs.slice(0, 2)) {
    insights.push({
      kind: 'pair',
      text: `On days you do ${p.anchor}, you also do ${p.follower} ${pct(p.withAnchor)} of the time, vs ${pct(p.without)} without it. ${p.anchor} is an anchor habit.`,
      weight: 8,
    });
  }

  // ---------- screen time vs everything else ----------
  let screenTime: Analysis['screenTime'] = null;
  const limitHabit = habits.find((x) => x.limit);
  if (limitHabit) {
    const measured = window.filter((s) => scheduledOn(s, limitHabit.name));
    const over = measured.filter((s) => s.missed.has(limitHabit.name));
    const under = measured.filter((s) => !s.missed.has(limitHabit.name));
    const missedOthers = (s: DayStatus) => [...s.missed].filter((n) => n !== limitHabit.name).length;
    if (over.length >= 2 && under.length >= 3) {
      const mo = over.reduce((t, s) => t + missedOthers(s), 0) / over.length;
      const mu = under.reduce((t, s) => t + missedOthers(s), 0) / under.length;
      screenTime = { name: limitHabit.name, overDays: over.length, missedWhenOver: round1(mo), missedWhenUnder: round1(mu) };
      if (mo - mu >= 0.5) {
        insights.push({ kind: 'screen', text: `On days over your phone limit you missed ${round1(mo)} ${round1(mo) === 1 ? 'quest' : 'quests'} on average, vs ${round1(mu)} on days under it.`, weight: 8 });
      }
    }
  }

  // ---------- recovery after a slip ----------
  let recovery: Analysis['recovery'] = null;
  const all = statuses(history, windowFrom, to);
  let slips = 0;
  let recovered = 0;
  all.forEach((s, i) => {
    if (s.kind !== 'slip' || i === all.length - 1) return;
    slips += 1;
    if (KEPT.includes(all[i + 1].kind)) recovered += 1;
  });
  if (slips > 0) {
    recovery = { slips, recovered };
    if (slips >= 2) {
      insights.push({
        kind: 'recovery',
        text:
          recovered / slips >= 0.75
            ? `After a slip you came back the next day ${recovered} of ${slips} times: misses don't snowball.`
            : `After a slip you came back the next day only ${recovered} of ${slips} times: protect the day after a miss.`,
        weight: recovered / slips >= 0.75 ? 3 : 7,
      });
    }
  }

  // ---------- mood (journal ratings) ----------
  const moods = input.journal.filter((j) => j.mood && j.day >= windowFrom && j.day <= to);
  const moodByDay = new Map(moods.map((j) => [j.day, j.mood!]));
  const byHabit: Analysis['mood']['byHabit'] = [];
  for (const h of habits.filter((x) => !x.limit)) {
    const days = window.filter((s) => scheduledOn(s, h.name) && moodByDay.has(s.day));
    const k = days.filter((s) => keptOn(s, h.name)).map((s) => moodByDay.get(s.day)!);
    const m = days.filter((s) => !keptOn(s, h.name)).map((s) => moodByDay.get(s.day)!);
    if (k.length >= 3 && m.length >= 3) {
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      byHabit.push({ name: h.name, kept: round1(avg(k)), missed: round1(avg(m)) });
    }
  }
  byHabit.sort((a, b) => b.kept - b.missed - (a.kept - a.missed));
  for (const b of byHabit.slice(0, 2)) {
    if (b.kept - b.missed >= 0.4) {
      insights.push({ kind: 'mood', text: `Mood averaged ${b.kept} on days you did ${b.name}, vs ${b.missed} on days you didn't.`, weight: 7 });
    }
  }
  const mood = { average: moods.length ? round1(moods.reduce((t, j) => t + j.mood!, 0) / moods.length) : null, entries: moods.length, byHabit };

  // ---------- Main Quest pace ----------
  const mainQuests = input.mainQuests.map((q) => {
    const recent = q.doneDays.filter((d) => d > addDays(today, -28) && d <= today).length;
    const perWeek = round1(recent / 4);
    const eta = perWeek > 0 && q.remaining > 0 ? addDays(today, Math.ceil((q.remaining / perWeek) * 7)) : null;
    return { name: q.name, perWeek, remaining: q.remaining, eta };
  });
  for (const q of mainQuests) {
    if (q.eta) insights.push({ kind: 'mainQuest', text: `${q.name}: ${q.perWeek} quests a week, ${q.remaining} left, on pace to finish around ${q.eta}.`, weight: 4 });
    else if (q.remaining > 0) insights.push({ kind: 'mainQuest', text: `${q.name}: no quests cleared in 4 weeks; ${q.remaining} left.`, weight: 5 });
  }

  insights.sort((a, b) => b.weight - a.weight);
  return { period: input.period, from, to, overview, habits, pairs, screenTime, recovery, mood, mainQuests, insights };
}

function changeText(now: number, before: number | null) {
  if (before === null) return 'first period with data';
  const d = Math.round((now - before) * 100);
  return d === 0 ? 'same as the previous period' : `${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points from the previous period`;
}

const FINDING_LABEL: Record<Insight['kind'], string> = {
  streak: 'streak',
  trend: 'strength trend',
  weekday: 'weak weekday',
  time: 'time of day',
  pair: 'anchor habit',
  screen: 'screen time',
  recovery: 'recovery',
  minimum: 'target too high',
  mood: 'mood link',
  mainQuest: 'main quest',
};

/** What the weekly/monthly AI report is written from: findings already computed, phrased per day. */
export function reportInput(
  a: Analysis,
  extra: { level: number; gateCleared?: boolean; writing?: { reflections?: { worked: string; blocked: string }; journal?: { day: DayKey; text: string }[] } },
) {
  return {
    period: a.period,
    from: a.from,
    to: a.to,
    player: { level: extra.level, streakDays: a.overview.streak, longestStreak: a.overview.longestStreak },
    days: {
      thisPeriod: `${a.overview.daysKept}/${a.overview.days} days kept (${a.overview.days ? pct(a.overview.daysKept / a.overview.days) : '0%'})`,
      previousPeriod: a.overview.previousRate === null ? 'no data' : `${pct(a.overview.previousRate)} of days kept`,
      // Spelled out so the report never gets the direction wrong.
      change: changeText(a.overview.days ? a.overview.daysKept / a.overview.days : 0, a.overview.previousRate),
      gatesClearedLast4Weeks: a.overview.gatesLast4Weeks,
    },
    quests: a.habits.map((h) => ({
      name: h.name,
      ...(h.limit ? { type: 'limit (kept by staying UNDER the daily limit)' } : {}),
      keptThisPeriod: `${h.periodKept}/${h.periodDays} days`,
      keptRecentWeeks: pct(h.rate),
      strength: h.strengthBefore === null ? `${h.strengthNow}%` : `${h.strengthBefore}% → ${h.strengthNow}%`,
      ...(h.worstDay ? { weakestDay: h.worstDay } : {}),
      ...(h.timeWindow ? { usualTime: `${h.timeWindow.label} (${pct(h.timeWindow.share)} of days)` } : {}),
      ...(h.minimumShare >= 0.3 ? { endsOnMinimum: pct(h.minimumShare) } : {}),
    })),
    // Ranked, most important first, each labelled with what kind of pattern it is.
    findings: a.insights.slice(0, 8).map((i) => `[${FINDING_LABEL[i.kind]}] ${i.text}`),
    // Only quests with a pace; stalled ones appear as a finding instead.
    mainQuests: a.mainQuests.filter((q) => q.eta).map((q) => ({ name: q.name, perWeek: q.perWeek, remaining: q.remaining, finishEstimate: q.eta })),
    ...(a.mood.entries ? { mood: { average: a.mood.average, entries: a.mood.entries } } : {}),
    ...(extra.writing ? { playerWriting: extra.writing } : {}),
  };
}

export type ReportInput = ReturnType<typeof reportInput>;
