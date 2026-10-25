// Builds the Hunter Analysis for a week or a Season from the player's data, and the
// compact input the server's AI report is written from.
import { addDays, type Analysis, analyze, type AnalysisPeriod, previousMonthRange, type ReportInput, reportInput, reviewWeek } from '@/engine';
import type { PlayerData } from '@/hooks/use-player-state';

/** The days a report covers: the review week, or the last full calendar month (Season). */
export function periodRange(period: AnalysisPeriod, today: string): { from: string; to: string } {
  if (period === 'month') return previousMonthRange(today);
  const from = reviewWeek(today);
  return { from, to: addDays(from, 6) };
}

export function buildAnalysis(player: PlayerData, period: AnalysisPeriod): Analysis {
  const { from, to } = periodRange(period, player.today);
  const { state } = player;
  return analyze({
    period,
    from,
    to,
    today: player.today,
    history: state.history,
    habits: player.habits.map((h) => ({ id: h.id, name: h.name, limit: h.limit, archived: h.archived, unit: h.unit, target: h.target })),
    strength: Object.fromEntries(Object.entries(state.habits).map(([id, h]) => [id, h.strength])),
    logTimes: player.logTimes,
    journal: player.journal.map((j) => ({ day: j.day, mood: j.mood || null, energy: j.energy || null })),
    mainQuests: player.mainQuests.map((q) => {
      const tasks = q.data.chapters.flatMap((c) => c.tasks);
      return { name: q.name, doneDays: tasks.filter((t) => t.doneDay).map((t) => t.doneDay!), remaining: tasks.filter((t) => !t.doneDay).length };
    }),
    streak: state.streak,
    longestStreak: state.record.longestStreak,
  });
}

const MAX_JOURNAL_CHARS = 2000;

/** The report input; the player's own writing is included only when they allow it. */
export function buildReportInput(player: PlayerData, period: AnalysisPeriod): ReportInput {
  const analysis = buildAnalysis(player, period);
  let writing: Parameters<typeof reportInput>[1]['writing'];
  if (player.settings.aiReadsWriting) {
    const review = player.reviews.find((r) => r.week === reviewWeek(player.today))?.data;
    let budget = MAX_JOURNAL_CHARS;
    const journal = player.journal
      .filter((j) => j.day >= analysis.from && j.day <= analysis.to && j.text.trim())
      .map((j) => ({ day: j.day, text: j.text.trim() }))
      .filter((j) => (budget -= j.text.length) >= 0);
    writing = {
      ...(review && (review.worked || review.blocked) ? { reflections: { worked: review.worked, blocked: review.blocked } } : {}),
      ...(journal.length ? { journal } : {}),
    };
  }
  return reportInput(analysis, { level: player.state.level, writing });
}
