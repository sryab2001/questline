import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ProgressBar } from '@/components/progress-bar';
import { ReportCard } from '@/components/report-card';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import type { AnalysisPeriod, Insight } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { buildAnalysis } from '@/review/report-input';
import { colors, fonts } from '@/theme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;
const INSIGHT_ICON: Record<Insight['kind'], Icon> = {
  streak: 'fire',
  trend: 'chart-line',
  weekday: 'calendar-alert',
  time: 'clock-outline',
  pair: 'link-variant',
  screen: 'cellphone',
  recovery: 'backup-restore',
  minimum: 'arrow-collapse-down',
  mood: 'emoticon-outline',
  mainQuest: 'flag-variant-outline',
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Hunter Analysis: patterns from your history, for the review week or the last Season. */
export default function AnalysisScreen() {
  const params = useLocalSearchParams<{ period?: string }>();
  const player = usePlayerState();
  const [period, setPeriod] = useState<AnalysisPeriod>(params.period === 'month' ? 'month' : 'week');
  const a = useMemo(() => (player ? buildAnalysis(player, period) : null), [player, period]);
  if (!player || !a) return null;
  const o = a.overview;
  const rate = o.days ? o.daysKept / o.days : 0;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="HUNTER ANALYSIS" />
        <View style={styles.wrap}>
          <Chip label="Week" selected={period === 'week'} onPress={() => setPeriod('week')} />
          <Chip label="Season" selected={period === 'month'} onPress={() => setPeriod('month')} accent={colors.gold} />
        </View>

        <SystemWindow title={`${dayLabel(a.from).toUpperCase()} – ${dayLabel(a.to).toUpperCase()}`}>
          <View style={styles.grid}>
            <Stat label="Days kept" value={`${o.daysKept}/${o.days}`} color={colors.cyan} />
            <Stat
              label={o.previousRate === null ? 'First period' : `vs ${pct(o.previousRate)} before`}
              value={o.previousRate === null ? pct(rate) : `${rate >= o.previousRate ? '+' : ''}${Math.round((rate - o.previousRate) * 100)}`}
              color={o.previousRate === null || rate >= o.previousRate ? colors.cyan : colors.dangerSoft}
            />
            <Stat label="Streak" value={`${o.streak}`} color={colors.gold} sub={`record ${o.longestStreak}`} />
            <Stat label="Gates, 4 weeks" value={`${o.gatesLast4Weeks}`} />
          </View>
        </SystemWindow>

        <SystemWindow title="KEY FINDINGS" variant="epic">
          {a.insights.length === 0 ? (
            <SysText variant="caption">Not enough history yet. Patterns appear after a couple of weeks.</SysText>
          ) : (
            a.insights.slice(0, 8).map((i) => (
              <View key={i.text} style={styles.insight}>
                <MaterialCommunityIcons name={INSIGHT_ICON[i.kind]} size={18} color={i.weight >= 7 ? colors.gold : colors.epic} />
                <SysText style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.textSoft }}>{i.text}</SysText>
              </View>
            ))
          )}
        </SystemWindow>

        {a.pairs.length ? (
          <SystemWindow title="ANCHOR HABITS">
            {a.pairs.slice(0, 3).map((p) => (
              <View key={`${p.anchor}:${p.follower}`} style={{ gap: 4 }}>
                <SysText style={{ fontSize: 13, color: colors.text }}>
                  {p.follower}, by whether you did {p.anchor}
                </SysText>
                <Bar label={`with ${p.anchor}`} value={p.withAnchor} color={colors.cyan} />
                <Bar label="without" value={p.without} color={colors.textDone} />
              </View>
            ))}
          </SystemWindow>
        ) : null}

        <SystemWindow title="QUESTS">
          {a.habits.map((h) => {
            const trend = h.strengthBefore === null ? 0 : h.strengthNow - h.strengthBefore;
            return (
              <View key={h.name} style={styles.quest}>
                <View style={styles.row}>
                  <SysText style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{h.name}</SysText>
                  <SysText style={{ fontFamily: fonts.display, fontSize: 14, color: colors.cyan }}>
                    {h.periodKept}/{h.periodDays}
                  </SysText>
                </View>
                <ProgressBar value={h.rate} height={4} glow={false} color={h.limit ? colors.epic : colors.cyan} />
                <SysText variant="caption" style={{ fontSize: 11, lineHeight: 16 }}>
                  {[
                    `${pct(h.rate)} kept, recent weeks`,
                    `strength ${h.strengthBefore === null ? '' : `${h.strengthBefore} → `}${h.strengthNow}${trend ? (trend > 0 ? ' ▲' : ' ▼') : ''}`,
                    h.worstDay ? `weakest ${h.worstDay}` : null,
                    h.bestDay && !h.limit ? `best ${h.bestDay}` : null,
                    h.timeWindow ? `usually ${h.timeWindow.label} (${pct(h.timeWindow.share)})` : null,
                    h.minimumShare >= 0.3 ? `${pct(h.minimumShare)} on the minimum` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </SysText>
              </View>
            );
          })}
        </SystemWindow>

        {a.screenTime ? (
          <SystemWindow title="SCREEN TIME">
            <SysText style={{ fontSize: 13, color: colors.textSoft }}>
              Quests missed per day, by whether you went over {a.screenTime.name.toLowerCase().startsWith('phone') ? 'your phone limit' : a.screenTime.name}
            </SysText>
            <Bar label={`over (${a.screenTime.overDays} days)`} value={a.screenTime.missedWhenOver / Math.max(1, a.habits.length - 1)} text={`${a.screenTime.missedWhenOver}`} color={colors.dangerSoft} />
            <Bar label="under" value={a.screenTime.missedWhenUnder / Math.max(1, a.habits.length - 1)} text={`${a.screenTime.missedWhenUnder}`} color={colors.epic} />
          </SystemWindow>
        ) : null}

        <SystemWindow title="MOOD" variant="epic">
          {a.mood.entries ? (
            <>
              <SysText style={{ fontSize: 13, color: colors.textSoft }}>
                Average mood {a.mood.average}/5 over {a.mood.entries} journal entries
              </SysText>
              {a.mood.byHabit.slice(0, 4).map((m) => (
                <View key={m.name} style={{ gap: 2 }}>
                  <SysText variant="caption" style={{ fontSize: 12 }}>
                    {m.name}
                  </SysText>
                  <Bar label="did it" value={m.kept / 5} text={`${m.kept}`} color={colors.epic} />
                  <Bar label="didn't" value={m.missed / 5} text={`${m.missed}`} color={colors.textDone} />
                </View>
              ))}
            </>
          ) : (
            <SysText variant="caption" style={{ lineHeight: 18 }}>
              Rate your mood in the journal and the System will show which habits lift it.
            </SysText>
          )}
          <SysButton label="OPEN JOURNAL" variant="ghost" onPress={() => router.push('/journal')} />
        </SystemWindow>

        {a.mainQuests.length ? (
          <SystemWindow title="MAIN QUEST PACE">
            {a.mainQuests.map((q) => (
              <View key={q.name} style={styles.row}>
                <SysText style={{ flex: 1, fontSize: 13, color: colors.text }}>{q.name}</SysText>
                <SysText variant="caption" style={{ fontSize: 12 }}>
                  {q.eta ? `${q.perWeek}/week · ${q.remaining} left · ~${dayLabel(q.eta)}` : `${q.remaining} left · stalled`}
                </SysText>
              </View>
            ))}
          </SystemWindow>
        ) : null}

        <ReportCard player={player} period={period} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, sub, color = colors.text }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ width: '50%', alignItems: 'center', paddingVertical: 6 }}>
      <SysText style={{ fontFamily: fonts.display, fontSize: 22, color }}>{value}</SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {label}
      </SysText>
      {sub ? (
        <SysText variant="caption" style={{ fontSize: 10 }}>
          {sub}
        </SysText>
      ) : null}
    </View>
  );
}

function Bar({ label, value, text, color }: { label: string; value: number; text?: string; color: string }) {
  return (
    <View style={styles.barRow}>
      <SysText variant="caption" style={{ width: 96, fontSize: 11 }} numberOfLines={1}>
        {label}
      </SysText>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, Math.min(1, value) * 100)}%`, backgroundColor: color }]} />
      </View>
      <SysText style={{ width: 40, textAlign: 'right', fontFamily: fonts.display, fontSize: 12, color }}>{text ?? pct(value)}</SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  wrap: { flexDirection: 'row', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  insight: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  quest: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.track },
  barFill: { height: '100%' },
});
