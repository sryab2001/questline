import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { GoalProgress } from '@/engine';
import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

interface Props {
  goal: GoalProgress;
  onPress: () => void;
}

function formatProgress(g: GoalProgress) {
  if (g.target === 1 && !g.unit) return g.done ? '[Complete]' : '[Incomplete]';
  const shown = Math.min(g.progress, g.target);
  return `[${shown}/${g.target}]${g.unit ? ` ${g.unit}` : ''}`;
}

export function QuestRow({ goal, onPress }: Props) {
  const done = goal.done;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${goal.name}, ${formatProgress(goal)}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: done ? colors.panelRowDone : colors.panelRow,
          borderColor: done ? colors.borderDone : colors.borderMuted,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <View style={[styles.box, { backgroundColor: done ? colors.cyan : 'transparent' }]}>
        {done ? <MaterialCommunityIcons name="check-bold" size={14} color={colors.bg} /> : null}
      </View>
      <View style={styles.text}>
        <SysText
          style={[styles.name, { color: done ? colors.textDone : colors.text, textDecorationLine: done ? 'line-through' : 'none' }]}>
          {goal.name}
        </SysText>
        <SysText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
          {formatProgress(goal)}
        </SysText>
      </View>
      <View style={styles.stat}>
        <SysText style={styles.statText}>+{goal.stat}</SysText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1 },
  box: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  stat: { borderWidth: 1, borderColor: colors.borderMuted, paddingVertical: 2, paddingHorizontal: 6 },
  statText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.cyan },
});
