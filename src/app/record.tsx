import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { type DaySummary, findPatterns, RECORD_MILESTONES, WEEKDAY_NAMES } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const withUnit = (n: number, unit: string) => (unit ? `${fmt(n)} ${unit}` : `${fmt(n)} days`);

/** Real-world totals: what you actually did, not points. */
export default function RecordScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const { record } = player.state;
  const trend = record.keptLast30 - record.keptPrev30;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="HUNTER'S RECORD" />

        <SysButton label="WEEKLY REVIEW" variant="ghost" onPress={() => router.push('/review')} />

        <PatternsWindow history={player.state.history} today={player.today} />

        <SystemWindow title="SYSTEM REPORT">
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            Last 30 days, compared with the 30 before
          </SysText>
          <View style={styles.grid}>
            <Stat label="Days kept" value={String(record.keptLast30)} sub={trend === 0 ? 'same' : `${trend > 0 ? '+' : ''}${trend}`} color={colors.cyan} />
            <Stat label="Longest streak" value={String(record.longestStreak)} />
            <Stat label="Best week" value={`${record.bestWeek}/7`} />
            <Stat label="All-time kept" value={String(record.totalKept)} color={colors.gold} />
          </View>
        </SystemWindow>

        {record.habits.map((h) => {
          const next = RECORD_MILESTONES.find((m) => h.total < m.times * h.target);
          const change = h.last30 - h.prev30;
          return (
            <SystemWindow key={h.habitId} title={h.name.toUpperCase()}>
              <SysText style={styles.total}>{withUnit(h.total, h.unit)}</SysText>
              <View style={styles.line}>
                <SysText variant="caption">Last 30 days</SysText>
                <SysText style={styles.value}>
                  {withUnit(h.last30, h.unit)}
                  {h.prev30 > 0 || h.last30 > 0 ? (
                    <SysText style={{ fontSize: 12, color: change >= 0 ? colors.cyan : colors.dangerSoft }}>
                      {' '}
                      ({change >= 0 ? '+' : ''}
                      {fmt(change)})
                    </SysText>
                  ) : null}
                </SysText>
              </View>
              <View style={styles.line}>
                <SysText variant="caption">Days at full target</SysText>
                <SysText style={styles.value}>{h.daysDone}</SysText>
              </View>
              {h.unit ? (
                <View style={styles.line}>
                  <SysText variant="caption">Best single day</SysText>
                  <SysText style={styles.value}>{withUnit(h.bestDay, h.unit)}</SysText>
                </View>
              ) : null}
              {next ? (
                <View style={{ gap: 4 }}>
                  <View style={styles.line}>
                    <SysText variant="caption">
                      Next title: [{h.name} {next.tier}]
                    </SysText>
                    <SysText variant="caption">{withUnit(next.times * h.target, h.unit)}</SysText>
                  </View>
                  <ProgressBar value={h.total / (next.times * h.target)} color={colors.gold} height={4} glow={false} />
                </View>
              ) : null}
            </SystemWindow>
          );
        })}

        {record.milestones.length > 0 ? (
          <SystemWindow title="MILESTONES" variant="gold">
            {[...record.milestones].reverse().map((m) => {
              const h = record.habits.find((x) => x.habitId === m.habitId);
              return (
                <View key={`${m.habitId}:${m.times}`} style={styles.milestone}>
                  <MaterialCommunityIcons name="medal-outline" size={20} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <SysText style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.gold }}>[{m.title}]</SysText>
                    <SysText variant="caption" style={{ fontSize: 11 }}>
                      {withUnit(m.amount, h?.unit ?? '')} · {m.reachedDay}
                    </SysText>
                  </View>
                </View>
              );
            })}
          </SystemWindow>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PatternsWindow({ history, today }: { history: DaySummary[]; today: string }) {
  const p = findPatterns(history, today);
  const max = Math.max(1, ...p.weekdayDays);
  // Monday first, like the Gate.
  const order = [1, 2, 3, 4, 5, 6, 0];
  if (p.weekdayDays.every((d) => d === 0)) return null;
  return (
    <SystemWindow title="PATTERNS" variant="epic">
      <SysText variant="caption" style={{ textAlign: 'center' }}>
        Misses by weekday, last 8 weeks
      </SysText>
      <View style={styles.bars}>
        {order.map((d) => {
          const rate = p.weekdayDays[d] ? p.weekdayMissed[d] / p.weekdayDays[d] : 0;
          return (
            <View key={d} style={styles.barCol} accessibilityLabel={`${WEEKDAY_NAMES[d]}: ${p.weekdayMissed[d]} misses in ${p.weekdayDays[d]} days`}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max(4, rate * 100)}%`, backgroundColor: d === p.weakestDay ? colors.dangerSoft : colors.epic, opacity: p.weekdayDays[d] / max },
                  ]}
                />
              </View>
              <SysText variant="caption" style={{ fontSize: 11 }}>
                {WEEKDAY_NAMES[d].slice(0, 2)}
              </SysText>
            </View>
          );
        })}
      </View>
      {p.suggestions.map((s) => (
        <SysText key={s} style={{ fontSize: 13, lineHeight: 19, color: colors.textSoft }}>
          · {s}
        </SysText>
      ))}
    </SystemWindow>
  );
}

function Stat({ label, value, sub, color = colors.text }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ width: '50%', alignItems: 'center', paddingVertical: 8 }}>
      <SysText style={{ fontFamily: fonts.display, fontSize: 24, color }}>{value}</SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {label}
        {sub ? ` (${sub})` : ''}
      </SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  total: { fontFamily: fonts.display, fontSize: 28, textAlign: 'center', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  value: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, height: 90 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { flex: 1, width: '100%', backgroundColor: colors.track, justifyContent: 'flex-end' },
  barFill: { width: '100%' },
});
