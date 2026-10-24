import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { logProgress } from '@/db/actions';
import { isTimeUnit } from '@/dungeon';
import { usePlayerState } from '@/hooks/use-player-state';
import { playEvent, playSound } from '@/sound';
import { colors, fonts } from '@/theme';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Runs a routine one quest at a time: done, Dungeon (timed quests) or skip. */
export default function RoutineRun() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = usePlayerState();
  const [skipped, setSkipped] = useState<string[]>([]);
  if (!player) return null;

  const routine = player.routines.find((r) => r.id === id);
  if (!routine) return null;
  const goals = new Map(player.state.today.goals.map((g) => [g.habitId, g]));
  const habits = new Map(player.habits.map((h) => [h.id, h]));
  // Quests not scheduled today are left out of today's run.
  const steps = routine.habitIds.filter((h) => goals.has(h));
  const current = steps.find((h) => !goals.get(h)!.done && !skipped.includes(h));
  const doneCount = steps.filter((h) => goals.get(h)!.done).length;

  const complete = async (habitId: string) => {
    const g = goals.get(habitId)!;
    await logProgress(habitId, g.target - g.progress);
    const last = steps.every((h) => h === habitId || goals.get(h)!.done || skipped.includes(h));
    if (last) playEvent('routine');
    else playSound('quest');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <ScreenHeader title={routine.name.toUpperCase()} />
        <View style={styles.steps}>
          {steps.map((h, i) => {
            const g = goals.get(h)!;
            const on = h === current;
            return (
              <View
                key={h}
                style={[styles.pip, g.done && { backgroundColor: colors.cyan, borderColor: colors.cyan }, on && { borderColor: colors.gold }]}
                accessibilityLabel={`Step ${i + 1}: ${g.name}${g.done ? ', done' : ''}`}
              />
            );
          })}
        </View>
        {steps.length === 0 ? (
          <SystemWindow title="ROUTINE">
            <SysText style={{ textAlign: 'center' }}>None of this routine&apos;s quests are scheduled today.</SysText>
          </SystemWindow>
        ) : current ? (
          (() => {
            const g = goals.get(current)!;
            const h = habits.get(current);
            return (
              <SystemWindow title={`STEP ${steps.indexOf(current) + 1} / ${steps.length}`} pulse>
                {h?.cue ? <SysText style={styles.cue}>After {h.cue}</SysText> : null}
                <SysText style={styles.name}>{g.name}</SysText>
                {g.target > 1 || g.unit ? (
                  <SysText variant="caption" style={{ textAlign: 'center' }}>
                    {fmt(g.progress)} / {fmt(g.target)} {g.unit}
                  </SysText>
                ) : null}
                <ProgressBar value={doneCount / steps.length} height={4} />
                <SysButton label="DONE" onPress={() => complete(current)} />
                {isTimeUnit(g.unit) ? (
                  <SysButton label="ENTER DUNGEON" variant="ghost" onPress={() => router.push({ pathname: '/dungeon', params: { habitId: current } })} />
                ) : null}
                <SysButton label="SKIP FOR NOW" variant="ghost" onPress={() => setSkipped((p) => [...p, current])} />
              </SystemWindow>
            );
          })()
        ) : (
          <SystemWindow title="ROUTINE COMPLETE" variant="gold" pulse>
            <SysText style={styles.name}>{routine.name}</SysText>
            <SysText variant="caption" style={{ textAlign: 'center' }}>
              {doneCount} of {steps.length} cleared{skipped.length ? `, ${skipped.length} skipped` : ''}.
            </SysText>
            <SysButton label="RETURN" variant="gold" onPress={() => router.back()} />
          </SystemWindow>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 16 },
  steps: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  pip: { width: 28, height: 8, borderWidth: 1, borderColor: colors.borderMuted },
  cue: { fontSize: 12, color: colors.cyan, textAlign: 'center', fontFamily: fonts.bodyMedium },
  name: { fontFamily: fonts.display, fontSize: 26, textAlign: 'center', color: colors.text },
});
