import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { type ReviewData, saveReview, updateHabit } from '@/db/actions';
import { addDays, currentChapter, findPatterns, niceTarget, reviewWeek, taskOpen, weekSummary } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { cachedReport, fetchLatestReport, requestReport, type WeeklyReport } from '@/review/report';
import { playEvent } from '@/sound';
import { useSyncStatus } from '@/sync/status';
import { colors, fonts } from '@/theme';

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Sunday/Monday review: what happened, what to change, and what to aim for next week. */
export default function ReviewScreen() {
  const player = usePlayerState();
  const signedIn = useSyncStatus().signedIn;
  const week = player ? reviewWeek(player.today) : '';
  const saved = player?.reviews.find((r) => r.week === week)?.data;

  const [worked, setWorked] = useState(saved?.worked ?? '');
  const [blocked, setBlocked] = useState(saved?.blocked ?? '');
  const [focus, setFocus] = useState<string | null>(saved?.focus ?? null);
  const [planned, setPlanned] = useState<ReviewData['planned']>(saved?.planned ?? []);
  const [report, setReport] = useState<WeeklyReport | null>(cachedReport);
  const [asking, setAsking] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [adjusted, setAdjusted] = useState<string[]>([]);

  // Pick up a report the server wrote on Sunday.
  useEffect(() => {
    if (!signedIn) return;
    fetchLatestReport()
      .then((r) => r && setReport(r))
      .catch(() => {});
  }, [signedIn]);

  if (!player) return null;
  const { state, habits } = player;
  const summary = weekSummary(state.history, week);
  const patterns = findPatterns(state.history, player.today);
  const previous = [...player.reviews].reverse().find((r) => r.week < week);

  const ask = async () => {
    setAsking(true);
    setReportError(null);
    try {
      setReport(await requestReport());
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  const lower = async (name: string) => {
    const h = habits.find((x) => x.name === name);
    if (!h) return;
    await updateHabit(h.id, { target: Math.min(h.target, niceTarget(h.target * 0.8)) });
    setAdjusted((a) => [...a, name]);
  };
  const addMinimum = async (name: string) => {
    const h = habits.find((x) => x.name === name);
    if (!h || h.minTarget) return;
    await updateHabit(h.id, { minTarget: niceTarget(Math.max(1, h.target * 0.3)) });
    setAdjusted((a) => [...a, name]);
  };

  // Open quests of each Main Quest's current chapter, to aim for next week.
  const options = player.mainQuests.flatMap((q) => {
    const ci = currentChapter(q.data);
    const ch = q.data.chapters[ci];
    if (!ch) return [];
    return ch.tasks.map((t, ti) => ({ questId: q.id, title: t.title, open: taskOpen(q.data, ci, ti) })).filter((t) => t.open);
  });
  const togglePlan = (p: { questId: string; title: string }) =>
    setPlanned((list) =>
      list.some((x) => x.questId === p.questId && x.title === p.title)
        ? list.filter((x) => !(x.questId === p.questId && x.title === p.title))
        : list.length < 3
          ? [...list, { questId: p.questId, title: p.title }]
          : list,
    );

  const save = async () => {
    await saveReview(week, { worked: worked.trim(), blocked: blocked.trim(), focus, planned });
    playEvent('routine');
    router.back();
  };

  // How last week's plan went.
  const prevFocus = previous?.data.focus ? summary.quests.find((q) => q.name === previous.data.focus) : undefined;
  const prevPlanned = previous?.data.planned ?? [];
  const prevPlannedDone = prevPlanned.filter((p) =>
    player.mainQuests.find((q) => q.id === p.questId)?.data.chapters.some((c) => c.tasks.some((t) => t.title === p.title && t.doneDay)),
  ).length;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="WEEKLY REVIEW" />
        <SystemWindow title={`WEEK OF ${dayLabel(week).toUpperCase()} – ${dayLabel(addDays(week, 6)).toUpperCase()}`}>
          <View style={styles.grid}>
            <Stat label="Days kept" value={`${summary.kept}/${summary.days - summary.rested}`} color={colors.cyan} />
            <Stat label="Gate" value={summary.gateCleared ? 'Cleared' : 'Open'} color={summary.gateCleared ? colors.gold : colors.textMuted} />
            <Stat label="EXP" value={`${summary.xp >= 0 ? '+' : ''}${summary.xp}`} />
            <Stat label="Gold" value={`+${summary.gold}`} color={colors.gold} />
          </View>
          {previous ? (
            <View style={styles.block}>
              <SysText variant="label" style={{ fontSize: 12 }}>
                LAST WEEK&apos;S PLAN
              </SysText>
              {previous.data.focus ? (
                <SysText style={styles.line}>
                  Focus {previous.data.focus}: {prevFocus ? `kept ${prevFocus.kept} of ${prevFocus.kept + prevFocus.missed}` : 'no data this week'}
                </SysText>
              ) : null}
              {prevPlanned.length ? (
                <SysText style={styles.line}>
                  Main Quest goals: {prevPlannedDone} of {prevPlanned.length} cleared
                </SysText>
              ) : null}
            </View>
          ) : null}
        </SystemWindow>

        <SystemWindow title="QUESTS">
          {summary.quests.length === 0 ? <SysText variant="caption">No closed days this week yet.</SysText> : null}
          {summary.quests.map((q) => {
            const struggling = q.missed >= 3;
            const h = habits.find((x) => x.name === q.name);
            return (
              <View key={q.name} style={styles.quest}>
                <View style={styles.questHead}>
                  <SysText style={{ flex: 1, fontSize: 14, color: colors.text }}>{q.name}</SysText>
                  <SysText style={{ fontFamily: fonts.display, fontSize: 14, color: struggling ? colors.dangerSoft : colors.cyan }}>
                    {q.kept}/{q.kept + q.missed}
                    {q.minimum ? ` · ${q.minimum} min` : ''}
                  </SysText>
                </View>
                {struggling && h && !h.limit ? (
                  adjusted.includes(q.name) ? (
                    <SysText variant="caption" style={{ color: colors.epic }}>
                      Adjusted from next day on.
                    </SysText>
                  ) : (
                    <View style={styles.row}>
                      <SysButton label="LOWER TARGET 20%" variant="ghost" style={{ flex: 1, minHeight: 40 }} onPress={() => lower(q.name)} />
                      {!h.minTarget ? (
                        <SysButton label="ADD MINIMUM" variant="ghost" style={{ flex: 1, minHeight: 40 }} onPress={() => addMinimum(q.name)} />
                      ) : null}
                    </View>
                  )
                ) : null}
              </View>
            );
          })}
        </SystemWindow>

        {patterns.suggestions.length ? (
          <SystemWindow title="PATTERNS" variant="epic">
            {patterns.suggestions.map((s) => (
              <SysText key={s} style={styles.line}>
                · {s}
              </SysText>
            ))}
          </SystemWindow>
        ) : null}

        <SystemWindow title="THE SYSTEM'S REPORT" variant="gold">
          {report && report.through >= week ? (
            <>
              <SysText style={{ fontSize: 14, lineHeight: 21, color: colors.text }}>{report.body}</SysText>
              <SysText variant="caption" style={{ fontSize: 10 }}>
                Through {dayLabel(report.through)} · {report.model}
              </SysText>
            </>
          ) : (
            <SysText variant="caption" style={{ lineHeight: 18 }}>
              {signedIn
                ? 'Your server can write this week’s report with AI from your numbers and quest names (never your notes).'
                : 'Sign in to your server (Settings → Sync) to get an AI-written report.'}
            </SysText>
          )}
          {reportError ? <SysText style={{ fontSize: 12, color: colors.dangerSoft }}>{reportError}</SysText> : null}
          {signedIn ? (
            asking ? (
              <ActivityIndicator color={colors.gold} />
            ) : (
              <SysButton label={report && report.through >= week ? 'ASK AGAIN' : 'ASK THE SYSTEM'} variant="gold" onPress={ask} />
            )
          ) : null}
        </SystemWindow>

        <SystemWindow title="NEXT WEEK">
          <SysText variant="label" style={{ fontSize: 12 }}>
            WHAT WORKED?
          </SysText>
          <TextInput value={worked} onChangeText={setWorked} multiline placeholder="Doing push-ups right after brushing" placeholderTextColor={colors.textDone} style={styles.input} accessibilityLabel="What worked" />
          <SysText variant="label" style={{ fontSize: 12 }}>
            WHAT GOT IN THE WAY?
          </SysText>
          <TextInput value={blocked} onChangeText={setBlocked} multiline placeholder="Late meetings on Thursday" placeholderTextColor={colors.textDone} style={styles.input} accessibilityLabel="What got in the way" />
          <SysText variant="label" style={{ fontSize: 12 }}>
            FOCUS QUEST
          </SysText>
          <View style={styles.wrap}>
            {habits
              .filter((h) => !h.archived)
              .map((h) => (
                <Chip key={h.id} label={h.name} selected={focus === h.name} onPress={() => setFocus(focus === h.name ? null : h.name)} />
              ))}
          </View>
          {options.length ? (
            <>
              <SysText variant="label" style={{ fontSize: 12 }}>
                MAIN QUEST GOALS (UP TO 3)
              </SysText>
              <View style={styles.wrap}>
                {options.map((o) => (
                  <Chip
                    key={`${o.questId}:${o.title}`}
                    label={o.title}
                    selected={planned.some((p) => p.questId === o.questId && p.title === o.title)}
                    onPress={() => togglePlan(o)}
                    accent={colors.epic}
                  />
                ))}
              </View>
            </>
          ) : null}
          <SysButton label={saved ? 'UPDATE REVIEW' : 'SAVE REVIEW'} onPress={save} />
        </SystemWindow>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ width: '50%', alignItems: 'center', paddingVertical: 6 }}>
      <SysText style={{ fontFamily: fonts.display, fontSize: 22, color }}>{value}</SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {label}
      </SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  block: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 10 },
  line: { fontSize: 13, lineHeight: 20, color: colors.textSoft },
  quest: { gap: 6, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 8 },
  questHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: 'top',
  },
});
