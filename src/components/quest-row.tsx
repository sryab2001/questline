import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { GoalProgress } from '@/engine';
import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

interface Props {
  goal: GoalProgress;
  /** "After I …" trigger. */
  cue?: string;
  /** "Only while …" pairing. */
  bundle?: string;
  /** Habit strength 0–100. */
  strength?: number;
  /** The only goal left today (goal-gradient push). */
  isLast?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatProgress(g: GoalProgress) {
  if (g.target === 1 && !g.unit) return g.done ? '[Complete]' : '[Incomplete]';
  const shown = Math.min(g.progress, g.target);
  const min = g.minTarget && !g.done ? ` · min ${fmt(g.minTarget)}` : '';
  return `[${fmt(shown)}/${fmt(g.target)}]${g.unit ? ` ${g.unit}` : ''}${min}`;
}

export function QuestRow({ goal, cue, bundle, strength, isLast, onPress, onLongPress }: Props) {
  const done = goal.done;
  const passive = goal.mastered && !goal.weakened;
  const border = done ? colors.borderDone : goal.min ? colors.borderDone : isLast ? colors.gold : colors.borderMuted;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${goal.name}, ${formatProgress(goal)}${cue ? `, after ${cue}` : ''}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: done ? colors.panelRowDone : colors.panelRow,
          borderColor: border,
          opacity: pressed ? 0.75 : 1,
        },
        isLast && !done && { boxShadow: '0 0 12px rgba(255,200,87,0.35)' },
      ]}>
      <View style={[styles.box, { backgroundColor: done ? colors.cyan : 'transparent' }, goal.min && styles.boxMin]}>
        {done ? <MaterialCommunityIcons name="check-bold" size={14} color={colors.bg} /> : null}
        {goal.min ? <MaterialCommunityIcons name="minus" size={14} color={colors.cyan} /> : null}
      </View>
      <View style={styles.text}>
        {cue ? (
          <SysText style={styles.cue} numberOfLines={1}>
            After {cue}
          </SysText>
        ) : null}
        <SysText
          style={[styles.name, { color: done ? colors.textDone : colors.text, textDecorationLine: done ? 'line-through' : 'none' }]}>
          {goal.name}
        </SysText>
        <SysText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
          {formatProgress(goal)}
        </SysText>
        {bundle ? (
          <SysText style={styles.bundle} numberOfLines={1}>
            Only while {bundle}
          </SysText>
        ) : null}
        {strength !== undefined ? (
          <View style={styles.strengthTrack} accessibilityLabel={`Habit strength ${Math.round(strength)} percent`}>
            <View style={[styles.strengthFill, { width: `${Math.min(100, strength)}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={styles.stat}>
          <SysText style={styles.statText}>+{goal.stat}</SysText>
        </View>
        {goal.min ? <Badge label="MIN" color={colors.cyan} /> : null}
        {passive ? <Badge label="PASSIVE" color={colors.epic} /> : null}
        {goal.weakened ? <Badge label="WEAKENED" color={colors.dangerSoft} /> : null}
        {isLast && !done && !goal.min ? <Badge label="LAST GOAL" color={colors.gold} /> : null}
      </View>
    </Pressable>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <SysText style={[styles.badgeText, { color }]}>{label}</SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1 },
  box: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxMin: { backgroundColor: colors.panelRowDone },
  text: { flex: 1, gap: 2 },
  cue: { fontSize: 11, color: colors.cyan, fontFamily: fonts.bodyMedium },
  name: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  bundle: { fontSize: 11, color: colors.gold },
  strengthTrack: { height: 3, backgroundColor: colors.track, marginTop: 3, maxWidth: 160 },
  strengthFill: { height: '100%', backgroundColor: colors.epic },
  stat: { borderWidth: 1, borderColor: colors.borderMuted, paddingVertical: 2, paddingHorizontal: 6 },
  statText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.cyan },
  badge: { borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontFamily: fonts.display, fontSize: 10, letterSpacing: 1.2 },
});
