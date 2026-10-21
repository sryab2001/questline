import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, type ReactNode, use, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import {
  allocationsQuery,
  checkinsQuery,
  closePendingDays,
  dayResultsQuery,
  eventsQuery,
  habitsQuery,
  logsQuery,
  purchasesQuery,
  setSurvival,
  settingsQuery,
  skillUsesQuery,
  storeItemsQuery,
  toEngineHabit,
  updateSettings,
} from '@/db/actions';
import {
  addDays,
  type BoxResult,
  checkSurvival,
  computeState,
  dayKey,
  type DayOutcome,
  type DaySummary,
  type Habit,
  type OfferKind,
  parseSurvival,
  type PlayerState,
  type SurvivalQuest,
  URGENT_FREQUENCIES,
  type UrgentFrequency,
  type UrgentQuest,
  urgentQuestFor,
  urgentWindow,
} from '@/engine';
import { syncReminders } from '@/notifications';
import { setSoundEnabled } from '@/sound';
import { initSync, syncNow } from '@/sync/engine';
import { useSyncStatus } from '@/sync/status';

import { useNow } from './use-now';

export interface StoreItem {
  id: string;
  name: string;
  cost: number;
}

export interface PurchaseRecord {
  id: string;
  day: string;
  kind: string;
  cost: number;
  name: string;
  result: BoxResult | null;
  createdAt: Date;
}

export interface SurvivalEntry {
  day: string;
  quest: SurvivalQuest & { seen?: boolean };
}

export interface UrgentState {
  quest: UrgentQuest;
  start: Date;
  end: Date;
  status: 'upcoming' | 'active' | 'done' | 'skipped' | 'expired';
}

export interface PlayerData {
  state: PlayerState;
  habits: Habit[];
  settings: {
    playerName: string;
    timeZone: string;
    resetHour: number;
    morningHour: number;
    warningHour: number;
    lastSeenLevel: number;
    onboarded: boolean;
    soundOn: boolean;
    surprisesOn: boolean;
    title: string;
    urgentFrequency: UrgentFrequency;
  };
  today: string;
  now: Date;
  /** Penalized failed days the player hasn't dismissed yet, oldest first. */
  unseenFailures: DaySummary[];
  storeItems: StoreItem[];
  purchases: PurchaseRecord[];
  /** The running penalty quest, if any. */
  activeSurvival: SurvivalEntry | null;
  /** A finished penalty quest whose result hasn't been shown yet. */
  survivalResult: SurvivalEntry | null;
  /** Refs of one-time notices already shown ("season:2026-09", "report:2026-10-19", …). */
  seen: Set<string>;
  /** Today's Urgent Quest, if the day has one. */
  urgent: UrgentState | null;
  /** Upcoming Urgent Quests (today and the next days) that still need a notification. */
  urgentSchedule: { at: number; text: string }[];
}

const PlayerContext = createContext<PlayerData | null>(null);

const SYNC_DEBOUNCE_MS = 4000;

function useComputePlayer(): { player: PlayerData | null; dataVersion: object } {
  const { data: settingsRows } = useLiveQuery(settingsQuery());
  const { data: habitRows } = useLiveQuery(habitsQuery());
  const { data: logRows } = useLiveQuery(logsQuery());
  const { data: resultRows } = useLiveQuery(dayResultsQuery());
  const { data: purchaseRows } = useLiveQuery(purchasesQuery());
  const { data: skillRows } = useLiveQuery(skillUsesQuery());
  const { data: allocationRows } = useLiveQuery(allocationsQuery());
  const { data: storeRows } = useLiveQuery(storeItemsQuery());
  const { data: checkinRows } = useLiveQuery(checkinsQuery());
  const { data: eventRows } = useLiveQuery(eventsQuery());
  const now = useNow();

  // Changes identity whenever any synced table changes (not on the minute tick).
  const dataVersion = useMemo(
    () => [settingsRows, habitRows, logRows, resultRows, purchaseRows, skillRows, allocationRows, storeRows, checkinRows, eventRows],
    [settingsRows, habitRows, logRows, resultRows, purchaseRows, skillRows, allocationRows, storeRows, checkinRows, eventRows],
  );

  const player = useMemo((): PlayerData | null => {
    const s = settingsRows[0];
    if (!s) return null;
    const habits = habitRows.map(toEngineHabit);
    const today = dayKey(now, s.timeZone, s.resetHour);

    const survivals = resultRows.map((r) => ({ day: r.day, quest: parseSurvival(r.survivalStatus) }));
    const closedDays: DayOutcome[] = resultRows.map((r, i) => ({
      day: r.day,
      goals: JSON.parse(r.outcomesJson),
      survival: survivals[i].quest?.status ?? null,
    }));

    const urgentFrequency: UrgentFrequency = (URGENT_FREQUENCIES as readonly string[]).includes(s.urgentFrequency)
      ? (s.urgentFrequency as UrgentFrequency)
      : 'sometimes';
    const urgentAnswers = new Map(
      eventRows
        .filter((e) => e.kind === 'urgent' && e.dataJson)
        .map((e) => [e.ref, JSON.parse(e.dataJson!) as { challengeId: string; outcome: 'done' | 'skipped' }]),
    );

    const parsedPurchases = purchaseRows.map((p) => ({ ...p, result: p.resultJson ? (JSON.parse(p.resultJson) as BoxResult) : null }));
    const state = computeState({
      habits,
      logs: logRows.map((l) => ({ habitId: l.habitId, day: l.day, amount: l.amount })),
      closedDays,
      today,
      purchases: parsedPurchases.map((p) => ({ day: p.day, kind: p.kind, cost: p.cost, result: p.result })),
      skillUses: skillRows.map((u) => ({ skill: u.skill, day: u.day })),
      allocations: allocationRows.map((a) => ({ stat: a.stat, points: a.points })),
      checkins: checkinRows.map((c) => ({ habitId: c.habitId, day: c.day, avg: c.avg })),
      decisions: eventRows
        .filter((e) => e.kind === 'offer' && e.dataJson)
        .map((e) => ({ habitId: e.ref, kind: (JSON.parse(e.dataJson!) as { kind: OfferKind }).kind, day: e.day })),
      surprises: s.surprisesOn,
      urgentCleared: [...urgentAnswers.entries()]
        .filter(([, a]) => a.outcome === 'done')
        .map(([day, a]) => ({ day, challengeId: a.challengeId })),
    });

    // Urgent Quests: today's state, and notifications for the coming week.
    const urgentFor = (day: string) => urgentQuestFor(day, urgentFrequency, s.morningHour, s.warningHour);
    const todayQuest = urgentFor(today);
    let urgent: UrgentState | null = null;
    if (todayQuest) {
      const { start, end } = urgentWindow(todayQuest);
      const answer = urgentAnswers.get(today)?.outcome;
      const status = answer ?? (now < start ? 'upcoming' : now < end ? 'active' : 'expired');
      urgent = { quest: todayQuest, start, end, status };
    }
    const urgentSchedule: { at: number; text: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i);
      const q = urgentFor(day);
      if (!q || urgentAnswers.has(day)) continue;
      const at = urgentWindow(q).start.getTime();
      if (at > now.getTime()) urgentSchedule.push({ at, text: q.text });
    }

    const storeItems = storeRows.map((r) => ({ id: r.id, name: r.name, cost: r.cost }));
    const itemNames = new Map(storeRows.map((r) => [r.id, r.name]));
    const purchases: PurchaseRecord[] = parsedPurchases
      .map((p) => ({
        id: p.id,
        day: p.day,
        kind: p.kind,
        cost: p.cost,
        name: p.kind === 'treat' ? (itemNames.get(p.storeItemId) ?? 'Reward') : p.kind,
        result: p.result,
        createdAt: p.createdAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const unseen = new Set(resultRows.filter((r) => !r.acknowledged).map((r) => r.day));
    const activeSurvival = survivals.find((x) => x.quest?.status === 'active') as SurvivalEntry | undefined;
    const survivalResult = survivals.find(
      (x) => x.quest && x.quest.status !== 'active' && (x.quest as SurvivalEntry['quest']).seen === false,
    ) as SurvivalEntry | undefined;

    return {
      state,
      habits,
      settings: {
        playerName: s.playerName,
        timeZone: s.timeZone,
        resetHour: s.resetHour,
        morningHour: s.morningHour,
        warningHour: s.warningHour,
        lastSeenLevel: s.lastSeenLevel,
        onboarded: s.onboarded,
        soundOn: s.soundOn,
        surprisesOn: s.surprisesOn,
        title: s.title,
        urgentFrequency,
      },
      today,
      now,
      unseenFailures: state.history.filter((d) => (d.kind === 'slip' || d.kind === 'failure') && unseen.has(d.day)),
      storeItems,
      purchases,
      activeSurvival: activeSurvival ?? null,
      survivalResult: survivalResult ?? null,
      seen: new Set(eventRows.filter((e) => e.kind === 'seen').map((e) => e.ref)),
      urgent,
      urgentSchedule,
    };
  }, [settingsRows, habitRows, logRows, resultRows, purchaseRows, skillRows, allocationRows, storeRows, checkinRows, eventRows, now]);

  return { player, dataVersion };
}

/** Computes player state once for the whole app and runs the game's side effects. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const { player, dataVersion } = useComputePlayer();

  // Sync: on start, when returning to the app, and a few seconds after local changes.
  useEffect(() => {
    initSync().then(() => syncNow());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncNow();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => syncNow(), SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dataVersion]);

  // Close finished days whenever the day or habit list changes, but never mid-sync:
  // during a restore the logs may not have arrived yet.
  const syncState = useSyncStatus().state;
  const today = player?.today;
  const habitCount = player?.habits.length ?? 0;
  useEffect(() => {
    if (today && syncState !== 'syncing') closePendingDays();
  }, [today, habitCount, syncState]);

  // Players who already had quests before onboarding existed skip it.
  const needsOnboardedFlag = !!player && !player.settings.onboarded && habitCount > 0 && syncState !== 'syncing';
  useEffect(() => {
    if (needsOnboardedFlag) updateSettings({ onboarded: true });
  }, [needsOnboardedFlag]);

  // Penalty quest: settle it once its goals are met or its time runs out.
  const survival = player?.activeSurvival;
  const cleared = player?.state.today.cleared ?? 0;
  const nowMs = player?.now.getTime() ?? 0;
  useEffect(() => {
    if (!survival) return;
    const next = checkSurvival(survival.quest, cleared, Date.now());
    if (next) setSurvival(survival.day, { ...survival.quest, status: next, seen: false });
  }, [survival, cleared, nowMs]);

  const soundOn = player?.settings.soundOn ?? true;
  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

  // Keep scheduled reminders in step with today's progress and settings.
  // Passive Skills no longer need reminders: they don't count toward the warning.
  const remindable = player?.state.today.goals.filter((g) => !g.mastered || g.weakened) ?? [];
  const plan = player && {
    morningHour: player.settings.morningHour,
    warningHour: player.settings.warningHour,
    todayTotal: remindable.length,
    todayCleared: remindable.filter((g) => g.done || g.min).length,
    hasHabits: player.habits.length > 0,
    restedToday: player.state.today.rested,
    survivalDeadline: player.activeSurvival?.quest.deadline ?? null,
    streakAtRisk: player.state.streakAtRisk,
    urgent: player.urgentSchedule,
    cues: remindable
      .filter((g) => !g.done)
      .map((g) => {
        const cue = player.habits.find((h) => h.id === g.habitId)?.cue;
        return cue ? `After ${cue} → ${g.name}` : g.name;
      }),
  };
  const planKey = plan ? `${today}|${JSON.stringify(plan)}` : null;
  useEffect(() => {
    if (!plan) return;
    const t = setTimeout(() => syncReminders(plan).catch(() => {}), 800);
    return () => clearTimeout(t);
    // planKey captures every field of plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  return <PlayerContext value={player}>{children}</PlayerContext>;
}

export function usePlayerState(): PlayerData | null {
  return use(PlayerContext);
}
