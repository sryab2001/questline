import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import {
  CLEAR_DROP_CHANCE,
  COMEBACK_BONUS,
  CRITICAL_CHANCE,
  DAY_GOLD,
  FORGE_INPUTS,
  GATE_DAYS_REQUIRED,
  GATE_GOLD_V2,
  GATE_REWARD,
  GOAL_DROP_CHANCE,
  JOB_CHANGE_LEVEL,
  JOB_TRIAL_DAYS,
  JOB_XP_BONUS,
  MAIN_QUEST_COMPLETE_XP,
  MASTERY_MIN_CHECKIN,
  MASTERY_MIN_STRENGTH,
  MIN_CLEAR_REWARD,
  MIN_DAY_GOLD_SHARE,
  PASSIVE_STAT_BONUS,
  RARITIES,
  RARITY_WEIGHTS,
  SHIELD_CAP,
  SLIP_PENALTY_FACTOR,
  SYSTEM_ITEMS,
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
    title: 'LIMIT QUESTS',
    body: [
      'A Limit Quest is kept by staying under a limit instead of reaching a target: "Phone under 3 h". Questline reads your total screen time from Android (Usage access, on this phone only), so there is nothing to log.',
      'Today shows how much of the limit is left. The day is judged when it closes, on the real usage. A day with no reading, for example if access is turned off, counts neither way.',
    ],
  },
  {
    title: 'DUNGEONS & ROUTINES',
    body: [
      'Enter a Dungeon from any quest measured in minutes or hours: one task, a countdown, and the minutes are logged when the gate closes. You can leave the app; the time still counts.',
      'A Routine chains quests you do back to back ("water → push-ups → meditate"). Each step is the cue for the next, and a run takes one tap per step.',
    ],
  },
  {
    title: 'WEEKLY REVIEW',
    body: [
      'On Sundays and Mondays the System asks for a five-minute review: the week in numbers, quick fixes for quests that slipped (lower the target, add a minimum), what worked, what got in the way, and next week’s focus and Main Quest goals. Planning ahead like this is one of the better-evidenced habit techniques.',
      'The Record shows patterns from your history: your weakest weekday, quests that keep ending on the minimum, and quests that have become automatic.',
      'The Hunter Analysis (Record → Hunter Analysis) goes deeper, for the week or the last Season: anchor habits (one habit that makes another likely), weak weekdays, your usual time for each quest, screen time against missed quests, how mood follows your habits, and Main Quest finish estimates. It is all computed on your phone from your history.',
      'If your server has an AI key, the System writes the report from that analysis: weekly, and at the end of each Season. It sees numbers, quest names and patterns; your journal and reflections only if you allow it in Settings → Sync.',
    ],
  },
  {
    title: 'JOURNAL',
    body: [
      'An optional page for a few lines a day and how you felt (mood and energy). No streak, no reminders: skip it whenever you like. Writing things down helps some people think; the ratings show which habits lift your mood.',
    ],
  },
  {
    title: 'FROM THE HOME SCREEN',
    body: [
      'Add the Daily Quest widget (long-press your home screen → Widgets → Questline). Tap a circle to clear a quest without opening the app; tap anywhere else to open it.',
      'Morning and evening notifications carry "✓" buttons for up to three quests, and Urgent Quests a "✓ DONE". Clearing your last quest this way cancels that evening’s warning.',
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
      `Fixed EXP and gold never change. On top, each cleared quest has a ${pct(GOAL_DROP_CHANCE)} hidden chance of a loot drop, a full Daily Quest clear has ${pct(CLEAR_DROP_CHANCE)}, and any clear has ${pct(CRITICAL_CHANCE)} to be a Critical Clear (×2 EXP). Unique and Legendary drops carry gear.`,
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
      `Each week a Gate opens. Keep ${GATE_DAYS_REQUIRED} days to clear it (+${GATE_REWARD.xp} EXP, +${GATE_GOLD_V2} G and a rated item). Its card starts with one bonus stamp already filled.`,
      'Each month is a Season with a recap and a title for strong months. After a broken streak, the next Monday or 1st offers a Reawakening: lighten your quests and start a new 3-day streak.',
    ],
  },
  {
    title: 'GOLD & THE STORE',
    body: [
      `Gold measures days of effort: a kept day earns about ${DAY_GOLD} G (more for harder quests, ${Math.round(MIN_DAY_GOLD_SHARE * 100)}% on a Minimum Clear), a Gate ${GATE_GOLD_V2} G. Adding more quests doesn't inflate it.`,
      'So Store prices read as days: a coffee is one day, a movie night five, a concert a month. Pick treats worth working for; experiences tend to satisfy longer than things.',
      `Unlocks are free permissions ("Evening gaming") that open the moment the Daily Quest is kept. Streak Shields cost ${SYSTEM_ITEMS.shield.cost} G and you can hold ${SHIELD_CAP}. Nothing random is sold.`,
    ],
  },
  {
    title: 'GEAR & THE FORGE',
    body: [
      'Gear comes from Gates, achievements, Main Quest chapters and rare drops. It changes the rules rather than just the numbers: a Mantle of Second Wind forgives one slip a week, armor makes Minimum Clears pay more, a Charm of Stillness makes Rest Days cheaper, an Hourglass keeps Urgent Quests open longer.',
      `The Forge melts ${FORGE_INPUTS} items of one rarity into one of the next, and shows the result before you commit. Effects of gear, titles and jobs start the day you equip them, never retroactively.`,
      `At level ${JOB_CHANGE_LEVEL} the Job Change Quest unlocks: keep ${JOB_TRIAL_DAYS} days in a row, then pick a job from your strongest stats (+${JOB_XP_BONUS}% EXP for that stat).`,
    ],
  },
  {
    title: 'MAIN QUESTS',
    body: [
      'Big goals become chapters of small quests: Learn, Practice and Build. Chapters open in order; inside one, do the quests in any order. The Boss comes last: build or prove what you learned.',
      'Clearing a quest asks for one line on what you learned: recalling it is what makes it stick. Chapters can carry a Bounty, a real reward you set in advance and claim when the Boss falls.',
      `Link the daily habit that feeds the goal ("Study 30 min") to see its days and hours on the quest. Finishing a multi-chapter quest gives +${MAIN_QUEST_COMPLETE_XP} EXP, a rated item, a title and +2 to its stat. Paste an outline to set one up in seconds.`,
      'Or pick one from the Quest Board: ready-made paths (GenAI Engineer, Couch to Half Marathon, Strength Foundations, a language, 12 books, cooking, meditation, personal finance). Accepting one gives you your own copy to edit, and can add the daily quest that feeds it.',
    ],
  },
  {
    title: 'SHADOWS & THE RECORD',
    body: [
      'A mastered quest rises as a Shadow in your army: a record of habits that now run on their own. Shadows rank up as the habit strengthens and fade if it weakens.',
      "The Hunter's Record shows what you did for real: lifetime totals, the last 30 days against the 30 before, personal bests, and titles for 10×, 50×, 100× your daily target.",
      'Hidden stats (Indomitable, Composure, Insight, Dignity) only mirror how you play.',
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
