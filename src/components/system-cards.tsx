import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  acceptMastery,
  acceptOffer,
  answerUrgent,
  markSeen,
  recordDecision,
  submitCheckin,
  updateHabit,
} from '@/db/actions';
import {
  addDays,
  type DaySummary,
  describeDrop,
  GATE_REWARD,
  gateItem,
  type GateState,
  hash,
  SHADOW_NAMES,
  type Habit,
  IDENTITY_TITLES,
  niceTarget,
  PASSIVE_STAT_BONUS,
  type QuestOffer,
  SRBAI_ITEMS,
  weekday,
} from '@/engine';
import type { PlayerData } from '@/hooks/use-player-state';
import { playEvent, playSound } from '@/sound';
import { colors, fonts } from '@/theme';

import { RARITY_COLOR } from './gain-toast';
import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

// ---------- weekly Gate (endowed progress: the card starts with one stamp) ----------

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function GateCard({ gate }: { gate: GateState }) {
  const reward = gateItem(gate.weekStart);
  return (
    <SystemWindow title="WEEKLY GATE" variant={gate.complete ? 'gold' : 'system'}>
      <View style={styles.gateRow}>
        <Stamp label="★" state="bonus" />
        {gate.days.map((d, i) => (
          <Stamp key={i} label={WEEK[i]} state={d} />
        ))}
      </View>
      <SysText style={{ textAlign: 'center', fontSize: 13 }}>
        {gate.complete
          ? `Gate cleared. +${GATE_REWARD.xp} EXP · +${GATE_REWARD.gold} G`
          : `Keep ${gate.required - gate.kept} more day${gate.required - gate.kept === 1 ? '' : 's'} this week to clear the Gate (+${GATE_REWARD.xp} EXP, +${GATE_REWARD.gold} G).`}
      </SysText>
      <SysText variant="caption" style={{ textAlign: 'center', fontSize: 12, color: RARITY_COLOR[reward.rarity] }}>
        {gate.complete ? 'Acquired' : 'Reward'}: [{reward.rarity}] {reward.name}
      </SysText>
    </SystemWindow>
  );
}

function Stamp({ label, state }: { label: string; state: 'kept' | 'missed' | 'open' | 'none' | 'bonus' }) {
  const look = {
    bonus: { bg: '#2a2210', border: colors.gold, text: colors.gold },
    kept: { bg: colors.panelRowDone, border: colors.cyan, text: colors.cyan },
    missed: { bg: '#2a0e16', border: '#4a1a24', text: colors.dangerSoft },
    open: { bg: 'transparent', border: colors.borderMuted, text: colors.textMuted },
    none: { bg: 'transparent', border: colors.track, text: colors.textDone },
  }[state];
  return (
    <View style={[styles.stamp, { backgroundColor: look.bg, borderColor: look.border }]}>
      <SysText style={[styles.stampText, { color: look.text }]}>{state === 'kept' ? '✓' : label}</SysText>
    </View>
  );
}

// ---------- "do not miss twice" ----------

export function StreakRiskBanner() {
  return (
    <View style={styles.risk} accessibilityRole="alert">
      <MaterialCommunityIcons name="alert-outline" size={18} color={colors.gold} />
      <SysText style={{ flex: 1, fontSize: 13, lineHeight: 19, color: '#ffe2a3' }}>
        You slipped once. One slip does not break a Player. <SysText style={{ fontFamily: fonts.bodySemi, color: colors.gold }}>Do not miss twice.</SysText>{' '}
        A minimum clear is enough today.
      </SysText>
    </View>
  );
}

// ---------- Daily Report (peak-end) ----------

const KIND_LABEL: Record<DaySummary['kind'], string> = {
  cleared: 'DAILY QUEST CLEARED',
  min: 'KEPT ON MINIMUM',
  slip: 'SLIP',
  failure: 'FAILED',
  shielded: 'SHIELDED',
  rested: 'REST DAY',
  empty: 'NO QUEST',
};

export function DailyReportCard({ day }: { day: DaySummary }) {
  const gains = day.strength.filter((c) => c.after > c.before).sort((a, b) => b.after - b.before - (a.after - a.before));
  return (
    <SystemWindow title="DAILY REPORT">
      <SysText style={styles.reportTitle}>{KIND_LABEL[day.kind]}</SysText>
      {day.comeback ? <SysText style={{ textAlign: 'center', color: colors.gold }}>[Recovered] Comeback bonus applied.</SysText> : null}
      <View style={styles.reportStats}>
        <ReportStat label="EXP" value={`+${day.xpGained}`} />
        <ReportStat label="Gold" value={`+${day.goldGained}`} color={colors.gold} />
        <ReportStat label="Goals" value={`${day.cleared}/${day.total}`} />
      </View>
      {day.criticals.length ? <SysText style={styles.line}>Critical Clear: {day.criticals.join(', ')}</SysText> : null}
      {day.drops.map((d, i) => (
        <SysText key={i} style={styles.line}>
          Drop [{d.rarity}]: {describeDrop(d)}
        </SysText>
      ))}
      {gains.slice(0, 3).map((g) => (
        <View key={g.habitId} style={styles.strengthLine}>
          <SysText style={{ fontSize: 13, flex: 1 }}>{g.name}</SysText>
          <SysText style={{ fontSize: 13, color: colors.epic, fontVariant: ['tabular-nums'] }}>
            habit {Math.round(g.before)}% → {Math.round(g.after)}%
          </SysText>
        </View>
      ))}
      <SysButton label="CONTINUE" variant="ghost" onPress={() => markSeen(`report:${day.day}`)} />
    </SystemWindow>
  );
}

function ReportStat({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <SysText style={{ fontFamily: fonts.display, fontSize: 20, color }}>{value}</SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {label}
      </SysText>
    </View>
  );
}

// ---------- weekly automaticity check-in (SRBAI) ----------

export function CheckinCard({ habit, strength }: { habit: Habit; strength: number }) {
  const [scores, setScores] = useState<(number | null)[]>([null, null, null, null]);
  const complete = scores.every((s) => s !== null);

  const submit = async () => {
    await submitCheckin(habit.id, scores as number[]);
    playSound('tick');
  };

  return (
    <SystemWindow title="SYSTEM CHECK" variant="epic">
      <SysText style={{ textAlign: 'center', fontSize: 13, lineHeight: 19 }}>
        <SysText style={{ color: colors.epic, fontFamily: fonts.bodySemi }}>{habit.name}</SysText> is at {Math.round(strength)}%
        strength. How automatic is it now?
      </SysText>
      <SysText variant="caption" style={{ textAlign: 'center' }}>
        &quot;{habit.name} is something…&quot; 1 = disagree, 7 = agree
      </SysText>
      {SRBAI_ITEMS.map((item, i) => (
        <View key={item} style={{ gap: 6 }}>
          <SysText style={{ fontSize: 13, color: colors.text }}>…{item}</SysText>
          <View style={styles.scale} accessibilityRole="radiogroup" accessibilityLabel={item}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const on = scores[i] === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setScores((prev) => prev.map((v, j) => (j === i ? n : v)))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${n} of 7`}
                  style={[styles.scaleBtn, on && { borderColor: colors.epic, backgroundColor: '#241a40' }]}>
                  <SysText style={[styles.scaleText, on && { color: colors.epic }]}>{n}</SysText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <SysButton label="SUBMIT" disabled={!complete} onPress={submit} />
    </SystemWindow>
  );
}

// ---------- Mastery trial → Passive Skill ----------

export function MasteryCard({ habit }: { habit: Habit }) {
  const [skill, setSkill] = useState(`${habit.name} Mastery`);
  const [title, setTitle] = useState(IDENTITY_TITLES[habit.stat]);

  const accept = async () => {
    await acceptMastery(habit.id, skill || `${habit.name} Mastery`, title || IDENTITY_TITLES[habit.stat]);
    playEvent('arise');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  return (
    <SystemWindow title="MASTERY TRIAL" variant="epic" pulse>
      <SysText style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>
        <SysText style={{ color: colors.epic, fontFamily: fonts.bodySemi }}>{habit.name}</SysText> has become part of you. Accept it
        as a Passive Skill?
      </SysText>
      <View style={{ gap: 4 }}>
        <SysText style={styles.line}>· Its reminders stop. The cue carries it now.</SysText>
        <SysText style={styles.line}>· Permanent +{PASSIVE_STAT_BONUS} {habit.stat}.</SysText>
        <SysText style={styles.line}>· Half EXP per clear: take on a new challenge.</SysText>
        <SysText style={styles.line}>· If neglected it weakens and reminders return.</SysText>
        <SysText style={[styles.line, { color: colors.epic }]}>
          · It rises as {SHADOW_NAMES[hash(habit.id) % SHADOW_NAMES.length]}, a Shadow in your army.
        </SysText>
      </View>
      <SysText variant="label" style={{ fontSize: 12 }}>
        SKILL NAME
      </SysText>
      <TextInput value={skill} onChangeText={setSkill} style={styles.input} accessibilityLabel="Passive skill name" />
      <SysText variant="label" style={{ fontSize: 12 }}>
        TITLE EARNED
      </SysText>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} accessibilityLabel="Title earned" />
      <SysButton label="ARISE" onPress={accept} />
      <SysButton label="NOT YET" variant="ghost" onPress={() => recordDecision(habit.id, 'mastery', false)} />
    </SystemWindow>
  );
}

// ---------- quest upgrade / downgrade ----------

export function OfferCard({ offer }: { offer: QuestOffer }) {
  const unit = offer.unit ? ` ${offer.unit}` : '';
  const up = offer.kind === 'up';
  return (
    <SystemWindow title={up ? 'QUEST UPGRADE' : 'QUEST ADJUSTMENT'} variant={up ? 'gold' : 'system'}>
      <SysText style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>
        {up
          ? `14 clean clears of ${offer.name}. The System offers a harder quest:`
          : `${offer.name} has been hard lately. Lighter quests that you keep beat heavy ones you skip:`}
      </SysText>
      <SysText style={styles.offerLine}>
        {offer.fromTarget}
        {unit} → {offer.toTarget}
        {unit}
        {up ? ' · grade +1' : ''}
      </SysText>
      {offer.suggestMin ? (
        <SysText variant="caption" style={{ textAlign: 'center' }}>
          Plus a minimum clear of {offer.suggestMin}
          {unit} for bad days.
        </SysText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SysButton label="ACCEPT" variant={up ? 'gold' : 'primary'} style={{ flex: 1 }} onPress={() => acceptOffer(offer)} />
        <SysButton label="KEEP AS IS" variant="ghost" style={{ flex: 1 }} onPress={() => recordDecision(offer.habitId, offer.kind, false)} />
      </View>
    </SystemWindow>
  );
}

// ---------- Reawakening (fresh start after a broken streak) ----------

/** Monday or the 1st: temporal landmarks make a fresh start feel real. */
export function isLandmark(day: string) {
  return weekday(day) === 1 || day.endsWith('-01');
}

export function needsReawakening(player: PlayerData) {
  if (!isLandmark(player.today) || player.seen.has(`reawaken:${player.today}`)) return false;
  const weekAgo = addDays(player.today, -7);
  return player.state.history.some((d) => d.kind === 'failure' && d.day >= weekAgo);
}

export function ReawakeningCard({ player }: { player: PlayerData }) {
  const quests = player.habits.filter((h) => !h.mastered && !h.archived);
  const lower = (h: Habit) => updateHabit(h.id, { target: Math.min(h.target, niceTarget(h.target * 0.8)) });
  const giveMin = (h: Habit) => updateHabit(h.id, { minTarget: niceTarget(Math.max(1, h.target * 0.3)) });

  return (
    <SystemWindow title="REAWAKENING" variant="epic" pulse>
      <SysText style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>
        {weekday(player.today) === 1 ? 'A new week' : 'A new month'} has begun. The past is closed. Re-plan your quests and start a
        new 3-day streak.
      </SysText>
      {quests.map((h) => {
        const simple = h.target === 1 && !h.unit;
        return (
          <View key={h.id} style={styles.replan}>
            <SysText style={{ flex: 1, fontSize: 14, color: colors.text }}>
              {h.name}
              <SysText variant="caption">
                {'  '}
                {simple ? 'check' : `${h.target} ${h.unit}`}
                {h.minTarget ? ` · min ${h.minTarget}` : ''}
              </SysText>
            </SysText>
            {!simple ? (
              <Pressable style={styles.replanBtn} onPress={() => lower(h)} accessibilityLabel={`Lower ${h.name} target by 20 percent`}>
                <SysText style={styles.replanText}>−20%</SysText>
              </Pressable>
            ) : null}
            {!simple && !h.minTarget ? (
              <Pressable style={styles.replanBtn} onPress={() => giveMin(h)} accessibilityLabel={`Add a minimum to ${h.name}`}>
                <SysText style={styles.replanText}>+MIN</SysText>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <SysButton label="BEGIN ANEW" onPress={() => markSeen(`reawaken:${player.today}`)} />
    </SystemWindow>
  );
}

const styles = StyleSheet.create({
  gateRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  stamp: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stampText: { fontFamily: fonts.display, fontSize: 15 },
  risk: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: '#1d170b',
    padding: 12,
  },
  reportTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 2, textAlign: 'center', color: colors.cyan },
  reportStats: { flexDirection: 'row' },
  line: { fontSize: 13, color: colors.textSoft },
  strengthLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scale: { flexDirection: 'row', gap: 4 },
  scaleBtn: { flex: 1, height: 40, borderWidth: 1, borderColor: colors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  scaleText: { fontFamily: fonts.display, fontSize: 16, color: colors.textMuted },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  offerLine: { fontFamily: fonts.display, fontSize: 24, textAlign: 'center', color: colors.text },
  replan: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  replanBtn: { minWidth: 52, height: 40, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  replanText: { fontFamily: fonts.display, fontSize: 14, color: colors.cyan },
  urgentText: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, textAlign: 'center', color: colors.text },
  urgentMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  urgentTimer: { fontFamily: fonts.display, fontSize: 20, color: colors.gold, fontVariant: ['tabular-nums'] },
});

// ---------- Urgent Quest (optional surprise micro-quest) ----------

export function UrgentCard({ urgent, now }: { urgent: NonNullable<PlayerData['urgent']>; now: Date }) {
  const mins = Math.max(0, Math.ceil((urgent.end.getTime() - now.getTime()) / 60_000));
  const answer = (outcome: 'done' | 'skipped') => {
    if (outcome === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return answerUrgent(urgent.quest.day, urgent.quest.challengeId, outcome);
  };
  return (
    <SystemWindow title="URGENT QUEST" variant="gold" pulse>
      <SysText style={styles.urgentText}>{urgent.quest.text}</SysText>
      <View style={styles.urgentMeta}>
        <SysText variant="caption">+{urgent.quest.stat} · bonus EXP and gold · chance of loot</SysText>
        <SysText style={styles.urgentTimer}>{mins} min</SysText>
      </View>
      <SysText variant="caption" style={{ textAlign: 'center' }}>
        Optional. Ignoring it costs nothing.
      </SysText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SysButton label="DONE" variant="gold" style={{ flex: 1 }} onPress={() => answer('done')} />
        <SysButton label="SKIP" variant="ghost" style={{ flex: 1 }} onPress={() => answer('skipped')} />
      </View>
    </SystemWindow>
  );
}
