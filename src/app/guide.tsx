import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import {
  CLEAR_DROP_CHANCE,
  COMEBACK_BONUS,
  CRITICAL_CHANCE,
  GATE_DAYS_REQUIRED,
  GATE_REWARD,
  GOAL_DROP_CHANCE,
  MASTERY_MIN_CHECKIN,
  MASTERY_MIN_STRENGTH,
  MIN_CLEAR_REWARD,
  PASSIVE_STAT_BONUS,
  RARITIES,
  RARITY_WEIGHTS,
  SLIP_PENALTY_FACTOR,
  URGENT_CHANCE,
  URGENT_DROP_CHANCE,
  URGENT_REWARD,
  URGENT_WINDOW_MINUTES,
  WEAKENED_BELOW,
} from '@/engine';
import { colors, fonts } from '@/theme';

const pct = (n: number) => `${Math.round(n * 100)}%`;

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'THE GOAL',
    body: [
      'Questline is built to make itself unnecessary. A habit is something you do automatically when its cue appears, not something an app reminds you to do.',
      'Rewards help early on. The cue is what makes a habit last. So every quest gets a trigger, and quests you have mastered stop sending reminders.',
    ],
  },
  {
    title: 'TRIGGERS',
    body: [
      '"After I brush my teeth, I will do 50 push-ups." Linking a quest to something you already do (an if-then plan) makes follow-through much more likely than relying on willpower or reminders.',
    ],
  },
  {
    title: 'NEVER MISS TWICE',
    body: [
      `Missing one day barely affects habit formation; long gaps do. So a first miss is a Slip: ${pct(SLIP_PENALTY_FACTOR)} of the penalty and your streak survives. Miss again the next day and it is a Failure: full penalty, streak reset.`,
      `Coming back is rewarded: keep the day after a miss for +${pct(COMEBACK_BONUS)} EXP and gold.`,
    ],
  },
  {
    title: 'MINIMUM CLEAR',
    body: [
      `Give a quest a minimum (e.g. 10 of 100 push-ups). On bad days, reaching it keeps your streak with no penalty and ${pct(MIN_CLEAR_REWARD)} of the rewards. Doing a little keeps the cue alive.`,
    ],
  },
  {
    title: 'HABIT STRENGTH & MASTERY',
    body: [
      'Each quest has a strength meter that grows with every clear. Most habits take around two months of repetition, with wide variation.',
      `From 60% strength, the System asks four quick questions each week about how automatic the quest feels (a validated research scale). At ${MASTERY_MIN_STRENGTH}% strength with an average of ${MASTERY_MIN_CHECKIN}+ it offers a Mastery Trial.`,
      `A mastered quest becomes a Passive Skill: no more reminders, permanent +${PASSIVE_STAT_BONUS} to its stat, half EXP so you look for the next challenge. If it drops below ${WEAKENED_BELOW}% it weakens and reminders return.`,
    ],
  },
  {
    title: 'SURPRISES',
    body: [
      `Fixed EXP and gold never change. On top, each cleared quest has a ${pct(GOAL_DROP_CHANCE)} hidden chance of a loot drop, a full Daily Quest clear has ${pct(CLEAR_DROP_CHANCE)}, and any clear has ${pct(CRITICAL_CHANCE)} to be a Critical Clear (×2 EXP).`,
      `Drop rarity: ${RARITIES.map((r) => `${r} ${RARITY_WEIGHTS[r]}%`).join(' · ')}.`,
      'Rolls are fixed per quest per day, so undoing and redoing never re-rolls. Nothing random is ever bought with money. You can turn surprises off in Settings.',
    ],
  },
  {
    title: 'URGENT QUESTS',
    body: [
      `Sometimes the System issues a surprise micro-quest (a glass of water, 20 squats, two minutes of breathing) between your reminder hours. You have ${URGENT_WINDOW_MINUTES} minutes; clearing it gives +${URGENT_REWARD.xp} EXP, +${URGENT_REWARD.gold} G and a ${Math.round(URGENT_DROP_CHANCE * 100)}% chance of loot.`,
      `They are entirely optional: ignoring or skipping one costs nothing. Choose how often in Settings: Rare (~${Math.round(URGENT_CHANCE.rare * 7)}/week), Sometimes (~${Math.round(URGENT_CHANCE.sometimes * 7)}/week), Often (~${Math.round(URGENT_CHANCE.often * 7)}/week) or Off. At most one a day.`,
    ],
  },
  {
    title: 'GATES, SEASONS, FRESH STARTS',
    body: [
      `Each week a Gate opens. Keep ${GATE_DAYS_REQUIRED} days to clear it (+${GATE_REWARD.xp} EXP, +${GATE_REWARD.gold} G). Its card starts with one bonus stamp already filled.`,
      'Each month is a Season with a recap and a title for strong months. After a broken streak, the next Monday or 1st offers a Reawakening: lighten your quests and start a new 3-day streak.',
    ],
  },
  {
    title: 'WHAT QUESTLINE WILL NOT DO',
    body: [
      'No feeds, no endless scrolling, no daily login rewards, no guilt messages, no notification spam: at most a morning arrival, an evening warning, a penalty-quest alert, and the occasional optional Urgent Quest (or none, if you turn them off). Success is measured by how automatic your habits are, not by time in the app.',
    ],
  },
];

export default function GuideScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="HOW THE SYSTEM WORKS" />
        {SECTIONS.map((s) => (
          <SystemWindow key={s.title} title={s.title}>
            <View style={{ gap: 10 }}>
              {s.body.map((p, i) => (
                <SysText key={i} style={styles.p}>
                  {p}
                </SysText>
              ))}
            </View>
          </SystemWindow>
        ))}
        <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
          Sources and design notes: docs/behavior-design.md in the project.
        </SysText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  p: { fontSize: 14, lineHeight: 22, color: colors.textSoft, fontFamily: fonts.body },
});
