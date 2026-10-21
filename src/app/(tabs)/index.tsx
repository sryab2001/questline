import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GainToast } from '@/components/gain-toast';
import { LogSheet } from '@/components/log-sheet';
import { ProgressBar } from '@/components/progress-bar';
import { QuestRow } from '@/components/quest-row';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import {
  CheckinCard,
  DailyReportCard,
  GateCard,
  MasteryCard,
  needsReawakening,
  OfferCard,
  ReawakeningCard,
  StreakRiskBanner,
  UrgentCard,
} from '@/components/system-cards';
import { SystemWindow } from '@/components/system-window';
import { addHabits, logProgress, SAMPLE_HABITS } from '@/db/actions';
import { addDays, COMEBACK_BONUS, GOLD_DAILY_CLEAR, type GoalProgress, nextResetAt, POINTS_PER_DAILY_CLEAR } from '@/engine';
import { useClearEvents } from '@/hooks/use-clear-events';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

/** "HH:MM" from now until `until`. */
function hhmm(now: Date, until: Date | number) {
  const mins = Math.max(0, Math.floor((new Date(until).getTime() - now.getTime()) / 60_000));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

const isSimple = (g: GoalProgress) => g.target === 1 && !g.unit;

export default function QuestsScreen() {
  const player = usePlayerState();
  const [openId, setOpenId] = useState<string | null>(null);
  const habits = player?.habits;
  const grades = useMemo(() => new Map((habits ?? []).map((h) => [h.id, h.grade])), [habits]);
  const clearEvent = useClearEvents(player?.state.today, grades, player?.today ?? '');
  if (!player) return null;
  const { state, settings, now, activeSurvival } = player;
  const openGoal = state.today.goals.find((g) => g.habitId === openId) ?? null;

  const onPressGoal = async (g: GoalProgress) => {
    if (!isSimple(g)) return setOpenId(g.habitId);
    await logProgress(g.habitId, g.done ? -g.progress : g.target - g.progress);
    (g.done
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    ).catch(() => {});
  };

  const editGoal = (g: GoalProgress) => router.push({ pathname: '/habit/[id]', params: { id: g.habitId } });

  const habitById = new Map(player.habits.map((h) => [h.id, h]));
  const open = state.today.goals.filter((g) => !g.done && !g.min);
  const lastGoalId = open.length === 1 && state.today.total > 1 ? open[0].habitId : null;
  const lastRelevant = [...state.history].reverse().find((d) => d.kind !== 'empty' && d.kind !== 'rested');
  const comebackWaiting =
    !state.today.kept && !!lastRelevant && ['slip', 'failure', 'shielded'].includes(lastRelevant.kind);
  const yesterday = state.history.find((d) => d.day === addDays(player.today, -1));
  const report =
    yesterday && ['cleared', 'min', 'shielded', 'rested'].includes(yesterday.kind) && !player.seen.has(`report:${yesterday.day}`)
      ? yesterday
      : null;

  // One action card at a time keeps the screen calm.
  const checkinHabit = player.habits.find((h) => state.habits[h.id]?.checkinDue);
  const masteryHabit = player.habits.find((h) => state.habits[h.id]?.masteryReady);
  const actionCard = needsReawakening(player) ? (
    <ReawakeningCard player={player} />
  ) : masteryHabit ? (
    <MasteryCard key={masteryHabit.id} habit={masteryHabit} />
  ) : checkinHabit ? (
    <CheckinCard key={checkinHabit.id} habit={checkinHabit} strength={state.habits[checkinHabit.id].strength} />
  ) : state.offers[0] ? (
    <OfferCard key={state.offers[0].habitId + state.offers[0].kind} offer={state.offers[0]} />
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.identity}>
              <View style={styles.rankBadge}>
                <SysText style={styles.rankText}>{state.rank}</SysText>
              </View>
              <View style={{ gap: 2 }}>
                <SysText variant="title">{settings.playerName.toUpperCase()}</SysText>
                <SysText variant="caption">
                  Lv. {state.level} · {state.rank}-Rank · {state.streak}-day streak
                  {state.nextMilestone ? ` (next ${state.nextMilestone})` : ''}
                </SysText>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <SysText variant="caption" style={{ fontSize: 11, letterSpacing: 1.3 }}>
                TIME LIMIT
              </SysText>
              <SysText style={styles.timer}>{hhmm(now, nextResetAt(now, settings.resetHour))}</SysText>
            </View>
          </View>
          <Meter label="EXP" value={state.xpIntoLevel} max={state.xpForNext} color={colors.cyan} />
          <Meter label="HP" value={state.hp} max={state.maxHp} color={colors.dangerSoft} />
        </View>

        {activeSurvival ? (
          <SystemWindow variant="danger" title="PENALTY QUEST" pulse>
            <SysText style={styles.bannerTitle}>SURVIVAL</SysText>
            <SysText style={styles.bannerText}>
              Clear {Math.max(0, activeSurvival.quest.required - state.today.cleared)} more goal
              {activeSurvival.quest.required - state.today.cleared === 1 ? '' : 's'} to halve your penalty.
            </SysText>
            <SysText style={[styles.timer, { textAlign: 'center', color: colors.dangerSoft }]}>
              {hhmm(now, activeSurvival.quest.deadline)} left
            </SysText>
          </SystemWindow>
        ) : null}

        {player.urgent?.status === 'active' ? <UrgentCard urgent={player.urgent} now={now} /> : null}

        {state.today.rested ? (
          <SystemWindow variant="epic" title="REST DAY">
            <SysText style={styles.bannerText}>Skill active. Today carries no penalty and your streak is safe.</SysText>
          </SystemWindow>
        ) : null}

        {state.streakAtRisk && !state.today.rested ? <StreakRiskBanner /> : null}
        {report ? <DailyReportCard day={report} /> : null}
        {actionCard}

        <SystemWindow
          title="QUEST INFO"
          pulse={!state.today.allCleared}
          icon={<MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.cyan} />}>
          <SysText style={styles.arrival}>
            [Daily Quest: <SysText style={styles.questName}>Preparation to Become Powerful</SysText>] has arrived.
          </SysText>

          <View style={styles.goalsHeader}>
            <SysText variant="label">GOALS</SysText>
            <SysText variant="caption">
              {state.today.cleared} / {state.today.total} cleared
            </SysText>
          </View>

          {player.habits.length === 0 ? (
            <View style={{ gap: 12 }}>
              <SysText style={{ textAlign: 'center' }}>No quests yet. The System is waiting.</SysText>
              <SysButton label="ADD SAMPLE QUESTS" onPress={() => addHabits(SAMPLE_HABITS)} />
            </View>
          ) : state.today.goals.length === 0 ? (
            <SysText style={{ textAlign: 'center' }}>No goals scheduled today. Rest well, Player.</SysText>
          ) : (
            <View style={{ gap: 8 }}>
              {state.today.goals.map((g) => (
                <QuestRow
                  key={g.habitId}
                  goal={g}
                  cue={habitById.get(g.habitId)?.cue}
                  bundle={habitById.get(g.habitId)?.bundle}
                  strength={state.habits[g.habitId]?.strength}
                  isLast={g.habitId === lastGoalId}
                  onPress={() => onPressGoal(g)}
                  onLongPress={() => editGoal(g)}
                />
              ))}
              <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
                Tap to log progress · long-press to edit
              </SysText>
            </View>
          )}

          {state.today.total > 0 ? (
            <View style={styles.rewards}>
              <SysText variant="label" style={{ fontSize: 12 }}>
                REWARDS
              </SysText>
              <View style={styles.chips}>
                {['Status Recovery', `+${POINTS_PER_DAILY_CLEAR} Ability Points`, `+${GOLD_DAILY_CLEAR} G`].map((r) => (
                  <View key={r} style={styles.chip}>
                    <SysText style={[styles.chipText, r.endsWith('G') && { color: colors.gold }]}>{r}</SysText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {comebackWaiting ? (
            <SysText style={[styles.warning, { color: colors.gold }]}>
              Comeback bonus waiting: keep today for +{Math.round(COMEBACK_BONUS * 100)}% EXP and gold.
            </SysText>
          ) : null}
          {state.today.comeback ? (
            <SysText style={[styles.warning, { color: colors.gold }]}>[Recovered] Comeback bonus applied.</SysText>
          ) : null}
          {state.today.total > 0 && !state.today.kept && !state.today.rested ? (
            <SysText style={styles.warning}>
              <SysText style={[styles.warning, { fontFamily: fonts.bodySemi }]}>WARNING: </SysText>
              Failure to complete the daily quest will result in an appropriate penalty.
              {state.today.goals.some((g) => g.minTarget) ? ' A minimum clear counts.' : ''}
            </SysText>
          ) : null}
          {state.today.kept && !state.today.allCleared ? (
            <SysText style={[styles.warning, { color: colors.cyan }]}>Kept on minimum. Streak safe; full clears earn more.</SysText>
          ) : null}
          {state.today.allCleared ? (
            <SysText style={[styles.warning, { color: colors.cyan }]}>Daily Quest complete. Rewards received.</SysText>
          ) : null}
        </SystemWindow>

        {player.habits.length > 0 ? <GateCard gate={state.gate} /> : null}

        <View style={styles.actions}>
          <SysButton
            label="+ NEW QUEST"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/habit/[id]', params: { id: 'new' } })}
          />
          <SysButton label="ALL QUESTS" variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/habits')} />
        </View>
      </ScrollView>
      <GainToast event={clearEvent} />
      <LogSheet goal={openGoal} onClose={() => setOpenId(null)} />
    </SafeAreaView>
  );
}

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.meterLabels}>
        <SysText variant="caption" style={{ fontSize: 11, letterSpacing: 1.1 }}>
          {label}
        </SysText>
        <SysText variant="caption" style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {value.toLocaleString()} / {max.toLocaleString()}
        </SysText>
      </View>
      <ProgressBar value={value / max} color={color} height={label === 'HP' ? 4 : 6} glow={label !== 'HP'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20 },
  header: { gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  rankBadge: {
    width: 46,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 14px rgba(63,184,255,0.4)',
  },
  rankText: { fontFamily: fonts.display, fontSize: 24, color: colors.cyan },
  timer: { fontFamily: fonts.displaySemi, fontSize: 20, fontVariant: ['tabular-nums'] },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  arrival: { textAlign: 'center', fontSize: 14, lineHeight: 21 },
  questName: { color: colors.cyan, fontFamily: fonts.bodySemi },
  goalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    paddingBottom: 6,
  },
  warning: { fontSize: 12, lineHeight: 18, color: colors.dangerSoft, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  bannerTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 3, color: '#fbe9eb', textAlign: 'center' },
  bannerText: { fontSize: 13, lineHeight: 20, textAlign: 'center', color: colors.textSoft },
  rewards: { gap: 8, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.borderMuted, paddingVertical: 4, paddingHorizontal: 8 },
  chipText: { fontSize: 12, color: colors.text },
});
