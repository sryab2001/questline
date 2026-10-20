import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { prettyDay } from '@/components/penalty-modal';
import { ScreenHeader } from '@/components/screen-header';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addDays, type DaySummary, weekday } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

type Kind = 'cleared' | 'failed' | 'shielded' | 'rested' | 'empty' | 'today' | 'none';

const LOOK: Record<Kind, { bg: string; border: string; text: string; label: string }> = {
  cleared: { bg: '#123a5c', border: colors.cyan, text: colors.text, label: 'Cleared' },
  failed: { bg: '#3a1219', border: colors.dangerSoft, text: '#fbe9eb', label: 'Failed' },
  shielded: { bg: '#241a40', border: colors.epic, text: colors.text, label: 'Shielded' },
  rested: { bg: '#161a2c', border: '#7b7fb0', text: colors.textMuted, label: 'Rest day' },
  empty: { bg: 'transparent', border: colors.borderMuted, text: colors.textDone, label: 'Nothing scheduled' },
  today: { bg: colors.panelRow, border: colors.border, text: colors.text, label: 'Today' },
  none: { bg: 'transparent', border: 'transparent', text: colors.textDone, label: '' },
};

function kindOf(d: DaySummary | undefined): Kind {
  if (!d) return 'none';
  if (d.rested) return 'rested';
  if (d.shielded) return 'shielded';
  if (d.failed) return 'failed';
  if (d.total === 0) return 'empty';
  return 'cleared';
}

function monthKey(day: string) {
  return day.slice(0, 7);
}

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function HistoryScreen() {
  const player = usePlayerState();
  const [month, setMonth] = useState(() => monthKey(player?.today ?? '2026-01-01'));
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => new Map((player?.state.history ?? []).map((d) => [d.day, d])), [player?.state.history]);
  if (!player) return null;
  const { today, state } = player;

  // Calendar cells for the month, padded to start on Sunday.
  const first = `${month}-01`;
  const cells: (string | null)[] = Array.from({ length: weekday(first) }, () => null);
  for (let d = first; monthKey(d) === month; d = addDays(d, 1)) cells.push(d);

  const days = cells.filter((d): d is string => !!d).map((d) => byDay.get(d)).filter((d): d is DaySummary => !!d);
  const summary = {
    cleared: days.filter((d) => kindOf(d) === 'cleared').length,
    failed: days.filter((d) => kindOf(d) === 'failed').length,
    xp: days.reduce((s, d) => s + d.xpGained - d.xpLost, 0),
    gold: days.reduce((s, d) => s + d.goldGained, 0),
  };

  const detail = selected ? byDay.get(selected) : undefined;
  const isToday = selected === today;
  const canGoForward = month < monthKey(today);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="HISTORY" />
        <SystemWindow title="QUEST LOG">
          <View style={styles.monthRow}>
            <Pressable onPress={() => setMonth(shiftMonth(month, -1))} style={styles.navBtn} accessibilityLabel="Previous month">
              <MaterialCommunityIcons name="chevron-left" size={24} color={colors.cyan} />
            </Pressable>
            <SysText style={styles.monthTitle}>
              {new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}
            </SysText>
            <Pressable
              onPress={() => canGoForward && setMonth(shiftMonth(month, 1))}
              style={[styles.navBtn, !canGoForward && { opacity: 0.3 }]}
              accessibilityLabel="Next month"
              disabled={!canGoForward}>
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.cyan} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <SysText key={`h${i}`} variant="caption" style={styles.weekday}>
                {d}
              </SysText>
            ))}
            {cells.map((day, i) => {
              if (!day) return <View key={`p${i}`} style={styles.cell} />;
              const kind: Kind = day === today ? 'today' : day > today ? 'none' : kindOf(byDay.get(day));
              const look = LOOK[kind];
              const isSel = day === selected;
              return (
                <Pressable
                  key={day}
                  style={styles.cell}
                  onPress={() => setSelected(day)}
                  disabled={day > today}
                  accessibilityRole="button"
                  accessibilityLabel={`${prettyDay(day)}${look.label ? `, ${look.label}` : ''}`}>
                  <View
                    style={[
                      styles.cellInner,
                      { backgroundColor: look.bg, borderColor: isSel ? colors.text : look.border },
                      kind === 'cleared' && { boxShadow: '0 0 8px rgba(92,208,255,0.45)' },
                    ]}>
                    <SysText style={[styles.cellText, { color: look.text }]}>{Number(day.slice(8))}</SysText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            {(['cleared', 'failed', 'shielded', 'rested'] as Kind[]).map((k) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: LOOK[k].bg, borderColor: LOOK[k].border }]} />
                <SysText variant="caption" style={{ fontSize: 11 }}>
                  {LOOK[k].label}
                </SysText>
              </View>
            ))}
          </View>

          <View style={styles.summary}>
            <Stat label="Cleared" value={String(summary.cleared)} color={colors.cyan} />
            <Stat label="Failed" value={String(summary.failed)} color={colors.dangerSoft} />
            <Stat label="EXP" value={`${summary.xp >= 0 ? '+' : ''}${summary.xp}`} />
            <Stat label="Gold" value={`+${summary.gold}`} color={colors.gold} />
          </View>
        </SystemWindow>

        {selected ? (
          <SystemWindow title={prettyDay(selected).toUpperCase()} variant={detail?.failed && !detail.shielded && !detail.rested ? 'danger' : 'system'}>
            {isToday ? (
              <>
                <SysText>
                  In progress: {state.today.cleared}/{state.today.total} goals cleared.
                </SysText>
                {state.today.goals.map((g) => (
                  <GoalLine key={g.habitId} name={g.name} done={g.done} />
                ))}
              </>
            ) : detail ? (
              <>
                <SysText style={{ color: colors.text }}>
                  {LOOK[kindOf(detail)].label} · {detail.cleared}/{detail.total} goals
                  {detail.survival ? ` · Penalty quest ${detail.survival}` : ''}
                </SysText>
                {detail.done.map((n) => (
                  <GoalLine key={`d${n}`} name={n} done />
                ))}
                {detail.missed.map((n) => (
                  <GoalLine key={`m${n}`} name={n} done={false} />
                ))}
                <View style={styles.summary}>
                  <Stat label="EXP" value={`+${detail.xpGained}${detail.xpLost ? ` −${detail.xpLost}` : ''}`} />
                  <Stat label="Gold" value={`+${detail.goldGained}`} color={colors.gold} />
                  <Stat label="HP" value={`${detail.hpChange >= 0 ? '+' : ''}${detail.hpChange}`} color={colors.dangerSoft} />
                </View>
              </>
            ) : (
              <SysText variant="caption">No record for this day.</SysText>
            )}
          </SystemWindow>
        ) : (
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            Tap a day to see its goals.
          </SysText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function GoalLine({ name, done }: { name: string; done: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MaterialCommunityIcons name={done ? 'check-bold' : 'close'} size={16} color={done ? colors.cyan : colors.dangerSoft} />
      <SysText style={{ fontSize: 14, color: done ? colors.text : colors.textMuted }}>{name}</SysText>
    </View>
  );
}

function Stat({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <SysText style={{ fontFamily: fonts.display, fontSize: 18, color, fontVariant: ['tabular-nums'] }}>{value}</SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {label}
      </SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 2, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingBottom: 6, fontSize: 11 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellInner: { flex: 1, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: fonts.displaySemi, fontSize: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderWidth: 1 },
  summary: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 10 },
});
