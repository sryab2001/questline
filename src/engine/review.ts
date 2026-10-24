// Weekly review and patterns, computed from the closed-day history: what kept,
// what slipped, which weekday is weak, and a few concrete suggestions.
import { addDays, type DayKey, weekday } from './day';
import type { DayKind, DaySummary } from './types';

const KEPT: DayKind[] = ['cleared', 'min'];
const MISSED: DayKind[] = ['slip', 'failure', 'shielded'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The week a review covers: on Sunday the week ending today, on Monday the one that just ended. */
export function reviewWeek(today: DayKey): DayKey {
  const d = addDays(today, -1);
  return addDays(d, -((weekday(d) + 6) % 7));
}

/** Show the review prompt on Sundays and Mondays until that week is reviewed. */
export function reviewDue(today: DayKey): boolean {
  const w = weekday(today);
  return w === 0 || w === 1;
}

const baseName = (n: string) => n.replace(/ \(minimum\)$/, '');

export interface WeekSummary {
  weekStart: DayKey;
  kept: number;
  missed: number;
  rested: number;
  days: number;
  xp: number;
  gold: number;
  gateCleared: boolean;
  quests: { name: string; kept: number; minimum: number; missed: number }[];
}

export function weekSummary(history: DaySummary[], weekStart: DayKey): WeekSummary {
  const end = addDays(weekStart, 6);
  const days = history.filter((d) => d.day >= weekStart && d.day <= end && d.kind !== 'empty');
  const quests = new Map<string, { name: string; kept: number; minimum: number; missed: number }>();
  const q = (name: string) => {
    if (!quests.has(name)) quests.set(name, { name, kept: 0, minimum: 0, missed: 0 });
    return quests.get(name)!;
  };
  for (const d of days) {
    if (d.kind === 'rested') continue;
    for (const n of d.done) {
      const e = q(baseName(n));
      e.kept += 1;
      if (n !== baseName(n)) e.minimum += 1;
    }
    for (const n of d.missed) q(n).missed += 1;
  }
  return {
    weekStart,
    kept: days.filter((d) => KEPT.includes(d.kind)).length,
    missed: days.filter((d) => MISSED.includes(d.kind)).length,
    rested: days.filter((d) => d.kind === 'rested').length,
    days: days.length,
    xp: days.reduce((s, d) => s + d.xpGained - d.xpLost, 0),
    gold: days.reduce((s, d) => s + d.goldGained, 0),
    gateCleared: days.some((d) => d.gateCleared),
    quests: [...quests.values()].sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name)),
  };
}

export interface QuestPattern {
  name: string;
  kept: number;
  minimum: number;
  missed: number;
  /** Share of scheduled days kept (minimum counts), last 4 weeks. */
  rate: number;
  /** Weekday with the most misses, if it stands out. */
  weakDay: number | null;
}

export interface Patterns {
  /** Misses and scheduled days per weekday (0 = Sunday), last 8 weeks. */
  weekdayMissed: number[];
  weekdayDays: number[];
  weakestDay: number | null;
  quests: QuestPattern[];
  suggestions: string[];
}

export function findPatterns(history: DaySummary[], today: DayKey): Patterns {
  const from56 = addDays(today, -56);
  const from28 = addDays(today, -28);
  const recent = history.filter((d) => d.day >= from56 && d.day < today && d.kind !== 'empty' && d.kind !== 'rested');
  const weekdayMissed = [0, 0, 0, 0, 0, 0, 0];
  const weekdayDays = [0, 0, 0, 0, 0, 0, 0];
  for (const d of recent) {
    weekdayDays[weekday(d.day)] += 1;
    if (MISSED.includes(d.kind)) weekdayMissed[weekday(d.day)] += 1;
  }
  const totalMissed = weekdayMissed.reduce((a, b) => a + b, 0);
  const worst = weekdayMissed.indexOf(Math.max(...weekdayMissed));
  const avg = totalMissed / 7;
  const weakestDay = weekdayMissed[worst] >= 2 && weekdayMissed[worst] >= avg * 1.5 ? worst : null;

  const byQuest = new Map<string, { kept: number; minimum: number; missed: number; missDays: number[] }>();
  const entry = (name: string) => {
    if (!byQuest.has(name)) byQuest.set(name, { kept: 0, minimum: 0, missed: 0, missDays: [0, 0, 0, 0, 0, 0, 0] });
    return byQuest.get(name)!;
  };
  for (const d of recent.filter((x) => x.day >= from28)) {
    for (const n of d.done) {
      const e = entry(baseName(n));
      e.kept += 1;
      if (n !== baseName(n)) e.minimum += 1;
    }
    for (const n of d.missed) {
      const e = entry(n);
      e.missed += 1;
      e.missDays[weekday(d.day)] += 1;
    }
  }
  const quests: QuestPattern[] = [...byQuest.entries()]
    .map(([name, e]) => {
      const top = e.missDays.indexOf(Math.max(...e.missDays));
      return {
        name,
        kept: e.kept,
        minimum: e.minimum,
        missed: e.missed,
        rate: e.kept / Math.max(1, e.kept + e.missed),
        weakDay: e.missDays[top] >= 2 ? top : null,
      };
    })
    .sort((a, b) => a.rate - b.rate);

  const suggestions: string[] = [];
  if (weakestDay !== null) {
    suggestions.push(
      `${WEEKDAY_NAMES[weakestDay]}s are your weak day (${weekdayMissed[weakestDay]} misses in 8 weeks). Plan them the night before, or lean on Minimum Clears that day.`,
    );
  }
  for (const p of quests) {
    const samples = p.kept + p.missed;
    if (samples >= 7 && p.rate < 0.6) {
      suggestions.push(`${p.name} is kept ${p.kept} of ${samples} days. Lower the target or add a minimum: showing up beats size.`);
    } else if (p.kept >= 7 && p.minimum / p.kept >= 0.4) {
      suggestions.push(`${p.name} often ends on the minimum (${p.minimum} of ${p.kept}). The full target may be too high for now.`);
    }
  }
  const strong = [...quests].reverse().find((p) => p.kept + p.missed >= 14 && p.rate >= 0.9);
  if (strong) suggestions.push(`${strong.name} is nearly automatic (${Math.round(strong.rate * 100)}%). Try a harder version, or let it become a Passive Skill.`);
  if (recent.length >= 14 && totalMissed === 0) suggestions.push('No misses in the last weeks. Raise one target or start a new quest.');

  return { weekdayMissed, weekdayDays, weakestDay, quests, suggestions: suggestions.slice(0, 4) };
}
