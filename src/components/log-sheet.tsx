import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { logProgress, recordScreenTime } from '@/db/actions';
import { isTimeUnit } from '@/dungeon';
import type { GoalProgress } from '@/engine';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

import { ProgressBar } from './progress-bar';
import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

const NICE_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

/** Up to three quick-add steps that fit comfortably inside the target. */
export function quickSteps(target: number): number[] {
  const fit = NICE_STEPS.filter((s) => s <= target / 2);
  return (fit.length ? fit : [1]).slice(-3);
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

interface Props {
  goal: GoalProgress | null;
  onClose: () => void;
}

export function LogSheet({ goal, onClose }: Props) {
  const [custom, setCustom] = useState('');
  if (!goal) return null;

  const add = async (amount: number) => {
    const next = Math.max(0, goal.progress + amount);
    // Undo can't go below zero.
    const delta = next - goal.progress;
    if (delta === 0) return;
    await logProgress(goal.habitId, delta);
    const justDone = goal.progress < goal.target && next >= goal.target;
    // The clear chime comes from the Quests screen; partial logs just tick.
    if (!justDone) playSound('tick');
    (justDone
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    ).catch(() => {});
    if (justDone) onClose();
  };

  const submitCustom = () => {
    const n = Number(custom.replace(',', '.'));
    if (Number.isFinite(n) && n !== 0) add(n);
    setCustom('');
  };

  const remaining = Math.max(0, goal.target - goal.progress);
  const unit = goal.unit ? ` ${goal.unit}` : '';

  if (goal.limit) {
    const over = goal.progress > goal.target;
    return (
      <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
          <Pressable style={styles.sheet} onPress={() => {}}>
            <SystemWindow title="LIMIT QUEST" variant={over ? 'danger' : 'epic'}>
              <SysText variant="title" style={{ textAlign: 'center' }}>
                {goal.name}
              </SysText>
              <SysText style={{ textAlign: 'center', fontSize: 15, color: over ? colors.dangerSoft : colors.epic }}>
                {fmt(goal.progress)} of {fmt(goal.target)} min used ·{' '}
                {over ? `over by ${fmt(goal.progress - goal.target)}` : `${fmt(goal.target - goal.progress)} left`}
              </SysText>
              <ProgressBar value={goal.progress / goal.target} color={over ? colors.dangerSoft : colors.epic} />
              <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
                Tracked from your screen time, nothing to log. The day is judged when it closes.
              </SysText>
              <View style={styles.row}>
                <SysButton label="REFRESH" variant="ghost" style={{ flex: 1 }} onPress={() => recordScreenTime()} />
                <SysButton label="CLOSE" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
              </View>
            </SystemWindow>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <SystemWindow title="LOG PROGRESS">
            <View style={{ gap: 6 }}>
              <SysText variant="title" style={{ textAlign: 'center' }}>
                {goal.name}
              </SysText>
              <SysText variant="caption" style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                [{fmt(Math.min(goal.progress, goal.target))}/{fmt(goal.target)}]{unit}
              </SysText>
            </View>
            <ProgressBar value={goal.progress / goal.target} />

            <View style={styles.row}>
              {quickSteps(goal.target).map((s) => (
                <Pressable key={s} style={styles.step} onPress={() => add(s)} accessibilityLabel={`Add ${s}${unit}`}>
                  <SysText style={styles.stepText}>+{s}</SysText>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                onSubmitEditing={submitCustom}
                placeholder="Custom amount"
                placeholderTextColor={colors.textDone}
                keyboardType="numeric"
                returnKeyType="done"
                style={styles.input}
                accessibilityLabel="Custom amount"
              />
              <SysButton label="ADD" variant="ghost" onPress={submitCustom} style={{ minWidth: 80 }} />
            </View>

            {isTimeUnit(goal.unit) ? (
              <SysButton
                label="ENTER DUNGEON"
                variant="ghost"
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/dungeon', params: { habitId: goal.habitId } });
                }}
              />
            ) : null}
            {remaining > 0 ? (
              <SysButton label={`COMPLETE (+${fmt(remaining)})`} onPress={() => add(remaining)} />
            ) : (
              <SysText style={{ textAlign: 'center', color: colors.cyan }}>Goal cleared.</SysText>
            )}
            <View style={styles.row}>
              <SysButton label="RESET" variant="ghost" style={{ flex: 1 }} disabled={goal.progress === 0} onPress={() => add(-goal.progress)} />
              <SysButton label="CLOSE" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
            </View>
          </SystemWindow>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.82)', justifyContent: 'center', padding: 20 },
  sheet: {},
  row: { flexDirection: 'row', gap: 8 },
  step: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontFamily: fonts.display, fontSize: 20, color: colors.cyan },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
});
