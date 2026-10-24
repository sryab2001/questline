import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, type ReactNode, use, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import {
  allocationsQuery,
  checkinsQuery,
  classQuestsQuery,
  closePendingDays,
  recordScreenTime,
  type ReviewData,
  routinesQuery,
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
import { isTestWorld } from '@/db/client';
import {
  addDays,
  type BoxResult,
  checkSurvival,
  computeState,
  dayKey,
  type DayOutcome,
  type DaySummary,
  type Habit,
  type MainQuestData,
  type OfferKind,
  parseMainQuest,
  parseSurvival,
  type PlayerState,
  type Slot,
  type SurvivalQuest,
  URGENT_FREQUENCIES,
  type UrgentFrequency,
  type UrgentQuest,
  urgentQuestFor,
  urgentWindow,
} from '@/engine';
import * as Notifications from 'expo-notifications';

import { claimFinishedDungeon } from '@/dungeon';
import { syncReminders } from '@/notifications';
import { handleNotificationAction, saveSnapshot } from '@/quick/today';
import { setSoundEnabled } from '@/sound';
import { initSync, syncNow } from '@/sync/engine';
import { getSyncStatus, useSyncStatus } from '@/sync/status';
import { refreshWidget } from '@/widget/refresh';

import { useNow } from './use-now';

export interface StoreItem {
  id: string;
  name: string;
  cost: number;
  /** "treat" is bought with gold; "unlock" is free once the Daily Quest is kept. */
  kind: 'treat' | 'unlock';
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

export interface MainQuestRow {
  id: string;
  name: string;
  data: MainQuestData;
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
    aiReport: boolean;
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
  urgentSchedule: { at: number; text: string; day: string; challengeId: string }[];
  mainQuests: MainQuestRow[];
  routines: RoutineRow[];
  /** Weekly reviews by week start, latest save wins. */
  reviews: { week: string; data: ReviewData }[];
}

export interface RoutineRow {
  id: string;
  name: string;
  habitIds: string[];
}

const PlayerContext = createContext<PlayerData | null>(null);

/** Background sync cadence while the app is open. Settings also has Sync Now. */
const SYNC_INTERVAL_MS = 5 * 60_000;

function useComputePlayer(): PlayerData | null {
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
  const { data: classRows } = useLiveQuery(classQuestsQuery());
  const { data: routineRows } = useLiveQuery(routinesQuery());
  const now = useNow();

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

    // Player decisions in the order they were made (timelines depend on order).
    const ordered = [...eventRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const data = (e: (typeof eventRows)[number]) => (e.dataJson ? JSON.parse(e.dataJson) : {});
    const mainQuests: MainQuestRow[] = classRows.map((q) => ({ id: q.id, name: q.name, data: parseMainQuest(q.stepsJson) }));
    const routines: RoutineRow[] = routineRows.map((r) => ({ id: r.id, name: r.name, habitIds: JSON.parse(r.habitIdsJson) as string[] }));
    // Economy v2 starts on the earliest recorded cutover (one per device that upgraded).
    const economyDays = eventRows.filter((e) => e.kind === 'economy').map((e) => e.day).sort();

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
        .map((e) => {
          const d = JSON.parse(e.dataJson!) as { kind: OfferKind; accepted?: boolean };
          return { habitId: e.ref, kind: d.kind, day: e.day, accepted: d.accepted };
        }),
      equips: ordered.filter((e) => e.kind === 'equip').map((e) => ({ slot: e.ref as Slot, itemId: data(e).itemId ?? '', day: e.day })),
      titleChanges: ordered.filter((e) => e.kind === 'title').map((e) => ({ title: e.ref, day: e.day })),
      jobChanges: ordered.filter((e) => e.kind === 'job').map((e) => ({ jobId: e.ref, day: e.day })),
      jobTrials: ordered.filter((e) => e.kind === 'job_trial').map((e) => ({ day: e.day })),
      mainQuests,
      forges: ordered.filter((e) => e.kind === 'forge').map((e) => ({ day: e.day, inputs: (data(e).inputs as string[] | undefined) ?? [] })),
      economyFrom: economyDays[0] ?? null,
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
      const { start, end } = urgentWindow(todayQuest, state.modifiers.urgentMinutes);
      const answer = urgentAnswers.get(today)?.outcome;
      const status = answer ?? (now < start ? 'upcoming' : now < end ? 'active' : 'expired');
      urgent = { quest: todayQuest, start, end, status };
    }
    const urgentSchedule: PlayerData['urgentSchedule'] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i);
      const q = urgentFor(day);
      if (!q || urgentAnswers.has(day)) continue;
      const at = urgentWindow(q, state.modifiers.urgentMinutes).start.getTime();
      if (at > now.getTime()) urgentSchedule.push({ at, text: q.text, day, challengeId: q.challengeId });
    }

    const storeItems: StoreItem[] = storeRows.map((r) => ({ id: r.id, name: r.name, cost: r.cost, kind: r.kind === 'unlock' ? 'unlock' : 'treat' }));
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
        aiReport: s.aiReport,
      },
      today,
      now,
      unseenFailures: state.history.filter((d) => (d.kind === 'slip' || d.kind === 'failure') && !d.graced && unseen.has(d.day)),
      storeItems,
      purchases,
      activeSurvival: activeSurvival ?? null,
      survivalResult: survivalResult ?? null,
      seen: new Set(eventRows.filter((e) => e.kind === 'seen').map((e) => e.ref)),
      urgent,
      urgentSchedule,
      mainQuests,
      routines,
      reviews: [...new Map(ordered.filter((e) => e.kind === 'review').map((e) => [e.ref, data(e) as ReviewData])).entries()]
        .map(([week, d]) => ({ week, data: d }))
        .sort((a, b) => (a.week < b.week ? -1 : 1)),
    };
  }, [settingsRows, habitRows, logRows, resultRows, purchaseRows, skillRows, allocationRows, storeRows, checkinRows, eventRows, classRows, routineRows, now]);

  return player;
}

/** Computes player state once for the whole app and runs the game's side effects. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useComputePlayer();

  // Sync: on start, every 5 minutes while open, and on return if the last sync is older
  // than that. (Syncing on every local change looped: a sync's own writes count as changes.)
  useEffect(() => {
    initSync().then(() => syncNow());
    // A Dungeon whose time ran out while the app was closed pays out now.
    claimFinishedDungeon();
    // Screen-time Limit Quests: read usage now, on return, and with each sync tick.
    recordScreenTime();
    const timer = setInterval(() => {
      recordScreenTime();
      syncNow();
    }, SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      claimFinishedDungeon();
      recordScreenTime();
      if (Date.now() - (getSyncStatus().lastSyncAt ?? 0) >= SYNC_INTERVAL_MS) syncNow();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

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
  // Limit Quests have nothing to "do", so they get no reminders or buttons.
  const remindable = player?.state.today.goals.filter((g) => !g.limit && (!g.mastered || g.weakened)) ?? [];
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
    quick: [...remindable.filter((g) => !g.done), ...remindable.filter((g) => g.done)].map((g) => ({ habitId: g.habitId, name: g.name })),
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
    // The Test World leaves your real reminders alone.
    if (isTestWorld()) return;
    const t = setTimeout(() => syncReminders(plan).catch(() => {}), 800);
    return () => clearTimeout(t);
    // planKey captures every field of plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  // Home-screen widget: keep its header (level, streak) current and redraw it on any change.
  const widgetKey = player ? `${today}|${player.state.level}|${player.state.streak}|${player.state.today.cleared}|${player.state.today.kept}|${habitCount}` : null;
  useEffect(() => {
    if (!player || !widgetKey) return;
    saveSnapshot({ day: player.today, level: player.state.level, streak: player.state.streak, test: isTestWorld() });
    refreshWidget();
    // widgetKey captures every field the widget shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetKey]);

  // Notification buttons pressed while the app is open.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) handleNotificationAction(r);
    });
    return () => sub.remove();
  }, []);

  return <PlayerContext value={player}>{children}</PlayerContext>;
}

export function usePlayerState(): PlayerData | null {
  return use(PlayerContext);
}
