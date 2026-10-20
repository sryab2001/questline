import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { QuestRow } from '@/components/quest-row';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addHabits, logProgress, SAMPLE_HABITS } from '@/db/actions';
import type { GoalProgress } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

function toggleGoal(goal: GoalProgress) {
  // Phase 0: a tap completes the goal, a second tap undoes it.
  return logProgress(goal.habitId, goal.done ? -goal.progress : goal.target - goal.progress);
}

export default function QuestsScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const { state, playerName } = player;

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
                <SysText variant="title">{playerName.toUpperCase()}</SysText>
                <SysText variant="caption">
                  Lv. {state.level} · {state.rank}-Rank · {state.streak}-day streak
                </SysText>
              </View>
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <View style={styles.xpLabels}>
              <SysText variant="caption" style={{ letterSpacing: 1.1 }}>
                EXP
              </SysText>
              <SysText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
                {state.xpIntoLevel.toLocaleString()} / {state.xpForNext.toLocaleString()}
              </SysText>
            </View>
            <ProgressBar value={state.xpIntoLevel / state.xpForNext} />
          </View>
        </View>

        <SystemWindow
          title="QUEST INFO"
          pulse
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

          {state.today.goals.length === 0 ? (
            <View style={{ gap: 12 }}>
              <SysText variant="body" style={{ textAlign: 'center' }}>
                No quests yet. The System is waiting.
              </SysText>
              <Pressable style={styles.primaryButton} onPress={() => addHabits(SAMPLE_HABITS)}>
                <SysText style={styles.primaryButtonText}>ADD SAMPLE QUESTS</SysText>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {state.today.goals.map((g) => (
                <QuestRow key={g.habitId} goal={g} onPress={() => toggleGoal(g)} />
              ))}
            </View>
          )}

          {state.today.total > 0 && !state.today.allCleared ? (
            <SysText style={styles.warning}>
              <SysText style={[styles.warning, { fontFamily: fonts.bodySemi }]}>WARNING: </SysText>
              Failure to complete the daily quest will result in an appropriate penalty.
            </SysText>
          ) : null}
          {state.today.allCleared ? (
            <SysText style={[styles.warning, { color: colors.cyan }]}>Daily Quest complete. Rewards received.</SysText>
          ) : null}
        </SystemWindow>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20 },
  header: { gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between' },
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
  primaryButton: {
    minHeight: 48,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(92,208,255,0.6)',
  },
  primaryButtonText: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 3.4, color: colors.bg },
});
