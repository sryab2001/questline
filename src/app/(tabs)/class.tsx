import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RARITY_COLOR } from '@/components/gain-toast';
import { ProgressBar } from '@/components/progress-bar';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { advanceClassQuest, chooseJob, startJobTrial, undoClassQuest } from '@/db/actions';
import { describeEffect } from '@/engine';
import { type ClassQuestRow, type PlayerData, usePlayerState } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

export default function ClassScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const quests = player.classQuests;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <JobChangeWindow player={player} />

        <View style={styles.sectionHead}>
          <SysText variant="label">CLASS &amp; MAIN QUESTS</SysText>
          <SysText variant="caption">No time limit</SysText>
        </View>

        {quests.length === 0 ? (
          <SystemWindow title="CLASS QUEST" variant="epic">
            <SysText style={{ textAlign: 'center', lineHeight: 21 }}>
              Turn a long-term goal into a chain of graded steps (&quot;Run 5 km → 10 km → half marathon&quot;) or a single
              counted goal (&quot;Read 12 books&quot;). Finishing one awards a rated item.
            </SysText>
          </SystemWindow>
        ) : (
          quests.map((q) => <ClassQuestCard key={q.id} quest={q} player={player} />)
        )}

        <SysButton label="+ NEW CLASS QUEST" variant="ghost" onPress={() => router.push({ pathname: '/class-quest/[id]', params: { id: 'new' } })} />
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

function ClassQuestCard({ quest, player }: { quest: ClassQuestRow; player: PlayerData }) {
  const st = player.state.classQuests.find((c) => c.id === quest.id);
  const current = quest.steps.find((s) => !s.doneDay);
  const complete = !current;

  const advance = async () => {
    await advanceClassQuest(quest.id, quest.steps);
    const finishes = current && (!current.target || (current.count ?? 0) + 1 >= current.target);
    const last = quest.steps.filter((s) => !s.doneDay).length === 1;
    playSound(finishes ? (last ? 'levelup' : 'quest') : 'tick');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  return (
    <Pressable onLongPress={() => router.push({ pathname: '/class-quest/[id]', params: { id: quest.id } })} delayLongPress={350}>
      <SystemWindow title={complete ? 'CLEARED' : 'CLASS QUEST'} variant={complete ? 'gold' : 'epic'}>
        <SysText style={styles.questName}>[{quest.name}]</SysText>
        <ProgressBar value={st ? st.done / Math.max(1, st.total) : 0} color={colors.epic} height={5} glow={false} />
        <View style={{ gap: 6 }}>
          {quest.steps.map((s, i) => {
            const isCurrent = s === current;
            return (
              <View key={i} style={styles.stepRow}>
                <MaterialCommunityIcons
                  name={s.doneDay ? 'check-circle' : isCurrent ? 'circle-slice-3' : 'circle-outline'}
                  size={18}
                  color={s.doneDay ? colors.gold : isCurrent ? colors.epic : colors.textDone}
                />
                <SysText style={{ flex: 1, fontSize: 14, color: s.doneDay ? colors.textDone : isCurrent ? colors.text : colors.textMuted }}>
                  {s.title}
                  {s.target && s.target > 1 ? ` (${s.doneDay ? s.target : (s.count ?? 0)}/${s.target})` : ''}
                </SysText>
                <SysText style={styles.grade}>{s.grade}</SysText>
              </View>
            );
          })}
        </View>
        {st ? (
          <View style={styles.reward}>
            <SysText variant="caption">Reward</SysText>
            <SysText style={{ fontSize: 13, color: RARITY_COLOR[st.reward.rarity as keyof typeof RARITY_COLOR] }}>
              [{st.reward.rarity}] {st.reward.name}
            </SysText>
            <SysText variant="caption" style={{ fontSize: 11 }}>
              {st.reward.effects.map(describeEffect).join(' · ')}
            </SysText>
          </View>
        ) : null}
        {!complete ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SysButton
              label={current?.target && current.target > 1 ? '+1' : 'STEP DONE'}
              style={{ flex: 2 }}
              onPress={advance}
            />
            <SysButton label="UNDO" variant="ghost" style={{ flex: 1 }} onPress={() => undoClassQuest(quest.id, quest.steps)} />
          </View>
        ) : (
          <SysButton label="UNDO LAST STEP" variant="ghost" onPress={() => undoClassQuest(quest.id, quest.steps)} />
        )}
        <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
          Long-press to edit
        </SysText>
      </SystemWindow>
    </Pressable>
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
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  grade: { fontFamily: fonts.display, fontSize: 13, color: colors.epic },
  reward: { gap: 2, borderTopWidth: 1, borderTopColor: '#2c2650', paddingTop: 10 },
});
