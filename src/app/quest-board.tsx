import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { RARITY_COLOR } from '@/components/gain-toast';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { TASK_ICON } from '@/components/task-icon';
import { addHabit, saveMainQuest } from '@/db/actions';
import {
  BOARD_CATEGORIES,
  type BoardCategory,
  MAIN_QUEST_COMPLETE_XP,
  QUEST_BOARD,
  type QuestTemplate,
  questFromTemplate,
  questRarity,
  taskXp,
} from '@/engine';
import { type PlayerData, usePlayerState } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const scheduleText = (s: string) => (s === 'daily' ? 'daily' : s.split(',').map((d) => DAY_NAMES[Number(d)]).join(' · '));

/** Ready-made Main Quests: preview one, accept it, and it becomes yours to edit. */
export default function QuestBoardScreen() {
  const player = usePlayerState();
  const [category, setCategory] = useState<BoardCategory | 'All'>('All');
  const [open, setOpen] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<QuestTemplate | null>(null);
  if (!player) return null;

  const accepted = new Set(player.mainQuests.map((q) => q.data.templateId).filter(Boolean));
  const list = QUEST_BOARD.filter((t) => category === 'All' || t.category === category);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="QUEST BOARD" />
        <SysText variant="caption" style={{ lineHeight: 18 }}>
          Ready-made Main Quests. Accept one and it becomes your own copy: rename it, reorder it, add or drop quests.
        </SysText>
        <View style={styles.wrap}>
          {(['All', ...BOARD_CATEGORIES] as const).map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        {list.map((t) => {
          const quest = questFromTemplate(t, null);
          const tasks = quest.chapters.flatMap((c) => c.tasks);
          const expanded = open === t.id;
          const taken = accepted.has(t.id);
          return (
            <SystemWindow key={t.id} title={t.category.toUpperCase()} variant={taken ? 'gold' : 'epic'}>
              <Pressable onPress={() => setOpen(expanded ? null : t.id)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ gap: 6 }}>
                <SysText style={styles.name}>[{t.name}]</SysText>
                <SysText style={{ fontSize: 13, lineHeight: 19, color: colors.textSoft }}>{t.summary}</SysText>
                <SysText variant="caption" style={{ fontSize: 12 }}>
                  {quest.chapters.length} chapters · {tasks.length} quests · {t.duration} · {t.stat}
                </SysText>
                <SysText variant="caption" style={{ fontSize: 11, color: colors.epic }}>
                  {expanded ? 'Hide chapters ▴' : 'Show chapters ▾'}
                </SysText>
              </Pressable>

              {expanded ? (
                <View style={{ gap: 10 }}>
                  {quest.chapters.map((ch, ci) => (
                    <View key={ci} style={styles.chapter}>
                      <SysText style={styles.chapterTitle}>
                        CH.{ci + 1} {ch.title}
                      </SysText>
                      {ch.tasks.map((task, ti) => (
                        <View key={ti} style={styles.task}>
                          <MaterialCommunityIcons
                            name={TASK_ICON[task.boss ? 'boss' : task.type]}
                            size={16}
                            color={task.boss ? colors.dangerSoft : colors.epic}
                          />
                          <SysText style={{ flex: 1, fontSize: 13, color: colors.text }}>
                            {task.boss ? 'BOSS: ' : ''}
                            {task.title}
                            {task.target ? ` (×${task.target})` : ''}
                          </SysText>
                          <SysText style={styles.grade}>
                            {task.grade} · {taskXp(task)}
                          </SysText>
                        </View>
                      ))}
                    </View>
                  ))}
                  <View style={styles.reward}>
                    <SysText variant="caption">Finishing it · +{MAIN_QUEST_COMPLETE_XP} EXP · +2 {t.stat}</SysText>
                    <SysText style={{ fontSize: 13, color: RARITY_COLOR[questRarity(quest)] }}>
                      A {questRarity(quest)} item, plus one for every chapter
                    </SysText>
                    <SysText style={{ fontSize: 12, color: colors.gold }}>Title: [{t.title}]</SysText>
                  </View>
                </View>
              ) : null}

              <SysButton
                label={taken ? 'ACCEPTED · ACCEPT AGAIN' : 'ACCEPT QUEST'}
                variant={taken ? 'ghost' : 'primary'}
                onPress={() => setAccepting(t)}
              />
            </SystemWindow>
          );
        })}
      </ScrollView>
      {accepting ? <AcceptModal template={accepting} player={player} onClose={() => setAccepting(null)} /> : null}
    </SafeAreaView>
  );
}

function AcceptModal({ template: t, player, onClose }: { template: QuestTemplate; player: PlayerData; onClose: () => void }) {
  const existing = t.habit ? player.habits.find((h) => !h.archived && h.name.trim().toLowerCase() === t.habit!.name.toLowerCase()) : undefined;
  const [withHabit, setWithHabit] = useState(!!t.habit);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      let habitId: string | null = null;
      if (t.habit && withHabit) habitId = existing ? existing.id : await addHabit({ ...t.habit });
      await saveMainQuest(null, t.name, questFromTemplate(t, habitId));
      playSound('quest');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const h = t.habit;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title="ACCEPT MAIN QUEST" variant="epic" pulse>
          <SysText style={styles.name}>[{t.name}]</SysText>
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            It goes to your Class tab. Chapters open one at a time.
          </SysText>
          {h ? (
            <View style={{ gap: 8 }}>
              <SysText variant="label" style={{ fontSize: 13 }}>
                DAILY QUEST THAT FEEDS IT
              </SysText>
              <Pressable
                onPress={() => setWithHabit((v) => !v)}
                style={[styles.option, withHabit && { borderColor: colors.epic }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: withHabit }}>
                <MaterialCommunityIcons name={withHabit ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={withHabit ? colors.epic : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <SysText style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>
                    {existing ? `Link your "${existing.name}" quest` : `Add "${h.name}"`}
                  </SysText>
                  <SysText variant="caption" style={{ fontSize: 11 }}>
                    {existing
                      ? 'Its days and totals will show on the Main Quest.'
                      : `${h.target}${h.unit ? ` ${h.unit}` : ''} · ${scheduleText(h.schedule)}${h.minTarget ? ` · minimum ${h.minTarget}${h.unit ? ` ${h.unit}` : ''}` : ''}`}
                  </SysText>
                </View>
              </Pressable>
              {!existing && withHabit ? (
                <SysText variant="caption" style={{ fontSize: 11 }}>
                  Starts today. Add a trigger (&quot;After lunch…&quot;) from All Quests to make it stick.
                </SysText>
              ) : null}
            </View>
          ) : null}
          <SysButton label={busy ? 'ACCEPTING…' : 'ACCEPT'} disabled={busy} onPress={accept} />
          <SysButton label="CANCEL" variant="ghost" onPress={onClose} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontFamily: fonts.display, fontSize: 20, textAlign: 'center', color: colors.text },
  chapter: { borderWidth: 1, borderColor: colors.borderMuted, padding: 10, gap: 6 },
  chapterTitle: { fontFamily: fonts.displaySemi, fontSize: 15, letterSpacing: 0.8, color: colors.text },
  task: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  grade: { fontFamily: fonts.display, fontSize: 12, color: colors.epic },
  reward: { gap: 4, borderTopWidth: 1, borderTopColor: '#2c2650', paddingTop: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.88)', justifyContent: 'center', padding: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.borderMuted, padding: 10, minHeight: 56 },
});
