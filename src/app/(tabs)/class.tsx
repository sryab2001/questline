import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemLine } from '@/components/overgeared';
import { ProgressBar } from '@/components/progress-bar';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { TASK_ICON } from '@/components/task-icon';
import { chooseJob, startJobTrial, updateQuestTask } from '@/db/actions';
import { type QuestTask, taskOpen, taskXp } from '@/engine';
import { type MainQuestRow, type PlayerData, usePlayerState } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

export default function ClassScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const quests = player.mainQuests;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <JobChangeWindow player={player} />

        <View style={styles.sectionHead}>
          <SysText variant="label">MAIN QUESTS</SysText>
          <SysText variant="caption">No time limit</SysText>
        </View>

        {quests.length === 0 ? (
          <SystemWindow title="MAIN QUEST" variant="epic">
            <SysText style={{ textAlign: 'center', lineHeight: 21 }}>
              Turn a big goal (&quot;Learn GenAI&quot;, &quot;Run a half marathon&quot;) into chapters of small quests. Each chapter ends
              with a Boss: build or prove what you learned.
            </SysText>
          </SystemWindow>
        ) : (
          quests.map((q) => <MainQuestCard key={q.id} quest={q} player={player} />)
        )}

        <SysButton label="+ NEW MAIN QUEST" variant="ghost" onPress={() => router.push({ pathname: '/main-quest/[id]', params: { id: 'new' } })} />
      </ScrollView>
    </SafeAreaView>
  );
}

function JobChangeWindow({ player }: { player: PlayerData }) {
  const jc = player.state.jobChange;

  if (jc.job) {
    return (
      <SystemWindow title="JOB" variant="gold">
        <SysText style={styles.jobName}>{jc.job.name}</SysText>
        <SysText style={{ textAlign: 'center' }}>{jc.job.description}</SysText>
      </SystemWindow>
    );
  }

  if (!jc.unlocked) {
    return (
      <SystemWindow title="JOB CHANGE">
        <SysText style={{ textAlign: 'center' }}>
          The Job Change Quest unlocks at level {jc.unlockLevel}. You are level {player.state.level}.
        </SysText>
        <ProgressBar value={player.state.level / jc.unlockLevel} height={4} />
      </SystemWindow>
    );
  }

  if (!jc.trialStarted) {
    return (
      <SystemWindow title="JOB CHANGE QUEST" variant="gold" pulse>
        <SysText style={{ textAlign: 'center', lineHeight: 21 }}>
          You have reached level {jc.unlockLevel}. Prove yourself: keep your Daily Quest {jc.trialNeeded} days in a row, then choose
          your job.
        </SysText>
        <SysButton label="ACCEPT JOB CHANGE QUEST" variant="gold" onPress={() => startJobTrial()} />
      </SystemWindow>
    );
  }

  if (!jc.trialCleared) {
    return (
      <SystemWindow title="JOB CHANGE QUEST" variant="gold">
        <SysText style={{ textAlign: 'center' }}>
          Keep your Daily Quest {jc.trialNeeded} days in a row. A miss restarts the count.
        </SysText>
        <View style={styles.trialRow}>
          {Array.from({ length: jc.trialNeeded }, (_, i) => (
            <View key={i} style={[styles.trialPip, i < jc.trialProgress && { backgroundColor: colors.gold, borderColor: colors.gold }]} />
          ))}
        </View>
        <SysText variant="caption" style={{ textAlign: 'center' }}>
          {jc.trialProgress} / {jc.trialNeeded} days
        </SysText>
      </SystemWindow>
    );
  }

  const pick = (id: string, name: string) =>
    Alert.alert(`Become a ${name}?`, 'A job is permanent.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          await chooseJob(id);
          playSound('levelup');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        },
      },
    ]);

  return (
    <SystemWindow title="CHOOSE YOUR JOB" variant="gold" pulse>
      <SysText style={{ textAlign: 'center' }}>Trial cleared. These jobs match your strongest stats:</SysText>
      {jc.options.map((o) => (
        <Pressable key={o.id} style={styles.jobOption} onPress={() => pick(o.id, o.name)} accessibilityRole="button">
          <SysText style={[styles.jobName, { fontSize: 20 }]}>{o.name}</SysText>
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            {o.description}
          </SysText>
        </Pressable>
      ))}
    </SystemWindow>
  );
}

const amount = (n: number, unit: string) => `${Math.round(n * 10) / 10}${unit ? ` ${unit}` : ''}`;

function MainQuestCard({ quest, player }: { quest: MainQuestRow; player: PlayerData }) {
  const st = player.state.mainQuests.find((m) => m.id === quest.id);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [clearing, setClearing] = useState<{ ci: number; ti: number; task: QuestTask } | null>(null);
  if (!st) return null;
  const { data } = quest;
  const linked = data.habitId ? player.state.record.habits.find((h) => h.habitId === data.habitId) : undefined;

  const tapTask = (ci: number, ti: number, t: QuestTask) => {
    if (t.doneDay) {
      Alert.alert('Reopen this quest?', t.title, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', onPress: () => updateQuestTask(quest.id, quest.name, data, ci, ti, 'undo') },
      ]);
      return;
    }
    if (!taskOpen(data, ci, ti)) return;
    const finishes = !t.target || t.target <= 1 || (t.count ?? 0) + 1 >= t.target;
    if (!finishes) {
      updateQuestTask(quest.id, quest.name, data, ci, ti, 'advance');
      playSound('tick');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    }
    setClearing({ ci, ti, task: t });
  };

  const undoCount = (ci: number, ti: number, t: QuestTask) => {
    if (t.doneDay || !(t.count ?? 0)) return;
    Alert.alert('Take one off?', `${t.title} (${t.count}/${t.target})`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo one', onPress: () => updateQuestTask(quest.id, quest.name, data, ci, ti, 'undo') },
    ]);
  };

  return (
    <SystemWindow title={st.complete ? 'MAIN QUEST CLEARED' : 'MAIN QUEST'} variant={st.complete ? 'gold' : 'epic'}>
      <SysText style={styles.questName}>[{quest.name}]</SysText>
      <ProgressBar value={st.done / Math.max(1, st.total)} color={colors.epic} height={5} glow={false} />
      <SysText variant="caption" style={{ textAlign: 'center' }}>
        {st.done}/{st.total} quests · {data.stat}
        {linked ? ` · ${linked.daysDone} study days · ${amount(linked.total, linked.unit)}` : ''}
      </SysText>

      {data.chapters.map((ch, ci) => {
        const cs = st.chapters[ci];
        const open = expanded === ci || (expanded === null && ci === st.current);
        return (
          <View key={ci} style={[styles.chapter, ci === st.current && !st.complete && { borderColor: colors.epic }]}>
            <Pressable style={styles.chapterHead} onPress={() => setExpanded(open ? -1 : ci)} accessibilityRole="button">
              <MaterialCommunityIcons
                name={cs.cleared ? 'check-decagram' : cs.unlocked ? 'map-marker-path' : 'lock-outline'}
                size={18}
                color={cs.cleared ? colors.gold : cs.unlocked ? colors.epic : colors.textDone}
              />
              <SysText style={[styles.chapterTitle, !cs.unlocked && { color: colors.textDone }]} numberOfLines={1}>
                CH.{ci + 1} {ch.title}
              </SysText>
              <SysText variant="caption" style={{ fontSize: 12 }}>
                {cs.cleared ? 'cleared' : `${cs.done}/${cs.total}`}
              </SysText>
            </Pressable>
            {open ? (
              <View style={{ gap: 6 }}>
                {ch.tasks.map((t, ti) => {
                  const can = taskOpen(data, ci, ti);
                  const waiting = !t.doneDay && !can;
                  return (
                    <Pressable
                      key={ti}
                      style={styles.task}
                      onPress={() => tapTask(ci, ti, t)}
                      onLongPress={() => undoCount(ci, ti, t)}
                      delayLongPress={350}
                      accessibilityRole="button"
                      accessibilityState={{ checked: !!t.doneDay, disabled: waiting }}
                      accessibilityLabel={`${t.boss ? 'Boss: ' : ''}${t.title}`}>
                      <MaterialCommunityIcons
                        name={t.doneDay ? 'check-circle' : TASK_ICON[t.boss ? 'boss' : t.type]}
                        size={18}
                        color={t.doneDay ? colors.gold : t.boss ? colors.dangerSoft : waiting ? colors.textDone : colors.epic}
                      />
                      <View style={{ flex: 1 }}>
                        <SysText style={{ fontSize: 14, color: t.doneDay ? colors.textDone : waiting ? colors.textMuted : colors.text }}>
                          {t.boss ? 'BOSS: ' : ''}
                          {t.title}
                          {t.target && t.target > 1 ? ` (${t.doneDay ? t.target : (t.count ?? 0)}/${t.target})` : ''}
                        </SysText>
                        {t.note ? (
                          <SysText variant="caption" style={{ fontSize: 11 }} numberOfLines={2}>
                            “{t.note}”
                          </SysText>
                        ) : null}
                      </View>
                      <SysText style={styles.grade}>
                        {t.grade} · {taskXp(t)}
                      </SysText>
                    </Pressable>
                  );
                })}
                {ch.bounty ? <SysText style={styles.bounty}>Bounty: {ch.bounty}</SysText> : null}
                {cs.reward ? (
                  <View style={styles.reward}>
                    <SysText variant="caption">Chapter reward</SysText>
                    <ItemLine item={cs.reward} compact />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.reward}>
        <SysText variant="caption">Quest reward · +{st.completeXp} EXP</SysText>
        <ItemLine item={st.reward} compact />
        {st.title ? <SysText style={{ fontSize: 12, color: colors.gold }}>Title: [{st.title}] · +2 {data.stat}</SysText> : null}
        {data.bounty ? <SysText style={styles.bounty}>Bounty: {data.bounty}</SysText> : null}
      </View>
      <SysButton label="EDIT" variant="ghost" onPress={() => router.push({ pathname: '/main-quest/[id]', params: { id: quest.id } })} />
      {clearing ? (
        <ClearSheet
          task={clearing.task}
          onClose={() => setClearing(null)}
          onSave={async (note) => {
            const { ci, ti } = clearing;
            setClearing(null);
            await updateQuestTask(quest.id, quest.name, data, ci, ti, 'advance', note);
            const chapterDone = data.chapters[ci].tasks.every((o, j) => j === ti || o.doneDay);
            playSound(chapterDone ? 'levelup' : 'quest');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }}
        />
      ) : null}
    </SystemWindow>
  );
}

/** Clearing a quest: optionally write down what you learned (recall makes it stick). */
function ClearSheet({ task, onClose, onSave }: { task: QuestTask; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={task.boss ? 'BOSS DEFEATED' : 'QUEST CLEARED'} variant={task.boss ? 'gold' : 'epic'} pulse>
          <SysText style={styles.questName}>{task.title}</SysText>
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            +{taskXp(task)} EXP. In one line, what did you learn or build? (optional)
          </SysText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Embeddings map meaning to distance…"
            placeholderTextColor={colors.textDone}
            style={styles.input}
            multiline
            autoFocus
            accessibilityLabel="What you learned"
          />
          <SysButton label="CLEAR QUEST" variant={task.boss ? 'gold' : 'primary'} onPress={() => onSave(note)} />
          <SysButton label="CANCEL" variant="ghost" onPress={onClose} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  jobName: { fontFamily: fonts.display, fontSize: 26, textAlign: 'center', color: colors.gold, letterSpacing: 1 },
  jobOption: { borderWidth: 1, borderColor: colors.gold, backgroundColor: '#1d170b', padding: 12, gap: 4, minHeight: 64 },
  trialRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  trialPip: { width: 36, height: 12, borderWidth: 1, borderColor: colors.borderMuted },
  questName: { fontFamily: fonts.display, fontSize: 20, textAlign: 'center', color: colors.text },
  chapter: { borderWidth: 1, borderColor: colors.borderMuted, padding: 10, gap: 8 },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  chapterTitle: { flex: 1, fontFamily: fonts.displaySemi, fontSize: 15, letterSpacing: 0.8, color: colors.text },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  grade: { fontFamily: fonts.display, fontSize: 12, color: colors.epic },
  bounty: { fontSize: 12, color: colors.gold },
  reward: { gap: 4, borderTopWidth: 1, borderTopColor: '#2c2650', paddingTop: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.88)', justifyContent: 'center', padding: 20 },
  input: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
