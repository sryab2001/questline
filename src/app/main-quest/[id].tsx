import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { TASK_ICON } from '@/components/task-icon';
import { deleteMainQuest, saveMainQuest } from '@/db/actions';
import {
  type Chapter,
  chapterRarity,
  GRADES,
  type MainQuestData,
  parseOutline,
  type QuestTask,
  questRarity,
  type Stat,
  STATS,
  taskXp,
  TASK_TYPES,
  type TaskType,
} from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

const TYPE_LABEL: Record<TaskType, string> = { learn: 'Learn', practice: 'Practice', build: 'Build' };
const DEFAULT_GRADE = { learn: 'D', practice: 'C', build: 'B' } as const;

const blankTask = (type: TaskType = 'learn', boss = false): QuestTask => ({
  title: '',
  type,
  grade: boss ? 'B' : DEFAULT_GRADE[type],
  boss,
  target: null,
  count: 0,
  doneDay: null,
});
const blankChapter = (n: number): Chapter => ({ title: n === 1 ? 'Foundations' : '', bounty: '', tasks: [blankTask(), blankTask('build', true)] });

export default function MainQuestEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = usePlayerState();
  const isNew = id === 'new';
  const existing = isNew ? undefined : player?.mainQuests.find((q) => q.id === id);

  const [name, setName] = useState(existing?.name ?? '');
  const [data, setData] = useState<MainQuestData>(
    existing?.data ?? { v: 2, stat: 'INT', habitId: null, bounty: '', title: '', chapters: [blankChapter(1)] },
  );
  const [outline, setOutline] = useState<string | null>(null);

  const patch = (p: Partial<MainQuestData>) => setData((d) => ({ ...d, ...p }));
  const patchChapter = (ci: number, p: Partial<Chapter>) =>
    setData((d) => ({ ...d, chapters: d.chapters.map((c, i) => (i === ci ? { ...c, ...p } : c)) }));
  const patchTask = (ci: number, ti: number, p: Partial<QuestTask>) =>
    setData((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => (i === ci ? { ...c, tasks: c.tasks.map((t, j) => (j === ti ? { ...t, ...p } : t)) } : c)),
    }));
  const removeTask = (ci: number, ti: number) =>
    setData((d) => ({ ...d, chapters: d.chapters.map((c, i) => (i === ci ? { ...c, tasks: c.tasks.filter((_, j) => j !== ti) } : c)) }));
  const addTask = (ci: number) =>
    setData((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => {
        if (i !== ci) return c;
        // New quests go before the Boss.
        const boss = c.tasks.findIndex((t) => t.boss);
        const tasks = [...c.tasks];
        tasks.splice(boss < 0 ? tasks.length : boss, 0, blankTask());
        return { ...c, tasks };
      }),
    }));
  const toggleBoss = (ci: number) =>
    setData((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => {
        if (i !== ci) return c;
        const has = c.tasks.some((t) => t.boss);
        return { ...c, tasks: has ? c.tasks.filter((t) => !t.boss || t.doneDay) : [...c.tasks, blankTask('build', true)] };
      }),
    }));

  const importOutline = () => {
    const chapters = parseOutline(outline ?? '');
    if (chapters.length === 0) return;
    // Replace untouched blank chapters; otherwise append.
    const kept = data.chapters.filter((c) => c.tasks.some((t) => t.title.trim() || t.doneDay));
    patch({ chapters: [...kept, ...chapters] });
    setOutline(null);
  };

  const tasks = data.chapters.flatMap((c) => c.tasks);
  const valid = name.trim().length > 0 && data.chapters.length > 0 && data.chapters.every((c) => c.tasks.length > 0) && tasks.every((t) => t.title.trim());
  const xp = tasks.reduce((sum, t) => sum + taskXp(t), 0);

  const save = async () => {
    const clean: MainQuestData = {
      ...data,
      chapters: data.chapters.map((c, i) => ({
        ...c,
        title: c.title.trim() || `Chapter ${i + 1}`,
        tasks: c.tasks.map((t) => ({ ...t, title: t.title.trim(), target: t.target && t.target > 1 ? Math.round(t.target) : null })),
      })),
    };
    await saveMainQuest(isNew ? null : id, name, clean);
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this Main Quest?', 'Its progress and rewards are removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMainQuest(id);
          router.back();
        },
      },
    ]);

  const habits = player?.habits.filter((h) => !h.archived) ?? [];

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title={isNew ? 'NEW MAIN QUEST' : 'EDIT MAIN QUEST'} />

          <SystemWindow title="QUEST" variant="epic">
            <Label text="NAME" />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Learn GenAI"
              placeholderTextColor={colors.textDone}
              style={styles.input}
              autoFocus={isNew}
              accessibilityLabel="Main Quest name"
            />
            <Label text="STAT IT TRAINS" />
            <View style={styles.wrap}>
              {STATS.map((s) => (
                <Chip key={s} label={s} selected={data.stat === s} onPress={() => patch({ stat: s as Stat })} />
              ))}
            </View>
            <Label text="LINKED DAILY QUEST" />
            <SysText variant="caption" style={{ fontSize: 11 }}>
              The daily habit that feeds this goal, e.g. &quot;Study 30 min&quot;. Its days and totals show on the quest.
            </SysText>
            <View style={styles.wrap}>
              <Chip label="None" selected={!data.habitId} onPress={() => patch({ habitId: null })} />
              {habits.map((h) => (
                <Chip key={h.id} label={h.name} selected={data.habitId === h.id} onPress={() => patch({ habitId: h.id })} />
              ))}
            </View>
            <Label text="BOUNTY (OPTIONAL)" />
            <TextInput
              value={data.bounty}
              onChangeText={(t) => patch({ bounty: t })}
              placeholder="A real reward for finishing: that keyboard"
              placeholderTextColor={colors.textDone}
              style={styles.input}
              accessibilityLabel="Bounty for finishing"
            />
            {data.chapters.length > 1 ? (
              <>
                <Label text="TITLE EARNED" />
                <TextInput
                  value={data.title}
                  onChangeText={(t) => patch({ title: t })}
                  placeholder={`${name.trim() || 'Quest'} Conqueror`}
                  placeholderTextColor={colors.textDone}
                  style={styles.input}
                  accessibilityLabel="Title earned on completion"
                />
              </>
            ) : null}
          </SystemWindow>

          {outline === null ? (
            <SysButton label="PASTE AN OUTLINE" variant="ghost" onPress={() => setOutline('')} />
          ) : (
            <SystemWindow title="OUTLINE">
              <SysText variant="caption" style={{ lineHeight: 18 }}>
                Chapters on their own line, quests indented or with &quot;-&quot;. Prefix with Learn:, Practice:, Build: or Boss:. Add a
                grade like [B] or a count like x3.
              </SysText>
              <TextInput
                value={outline}
                onChangeText={setOutline}
                multiline
                placeholder={'Foundations\n  How LLMs work\n  Practice: Call an LLM API\n  Boss: Build an MCP server [B]\nRAG\n  Read 3 RAG papers x3'}
                placeholderTextColor={colors.textDone}
                style={[styles.input, { minHeight: 160, textAlignVertical: 'top', paddingVertical: 10 }]}
                accessibilityLabel="Outline"
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SysButton label="IMPORT" style={{ flex: 1 }} disabled={!outline.trim()} onPress={importOutline} />
                <SysButton label="CANCEL" variant="ghost" style={{ flex: 1 }} onPress={() => setOutline(null)} />
              </View>
            </SystemWindow>
          )}

          {data.chapters.map((ch, ci) => {
            const hasBoss = ch.tasks.some((t) => t.boss);
            return (
              <SystemWindow key={ci} title={`CHAPTER ${ci + 1}`}>
                <TextInput
                  value={ch.title}
                  onChangeText={(t) => patchChapter(ci, { title: t })}
                  placeholder="Chapter title"
                  placeholderTextColor={colors.textDone}
                  style={[styles.input, { fontFamily: fonts.displaySemi, fontSize: 16 }]}
                  accessibilityLabel={`Chapter ${ci + 1} title`}
                />
                {ch.tasks.map((t, ti) => (
                  <View key={ti} style={[styles.task, t.boss && { borderColor: colors.dangerSoft }]}>
                    <View style={styles.row}>
                      <MaterialCommunityIcons name={TASK_ICON[t.boss ? 'boss' : t.type]} size={18} color={t.boss ? colors.dangerSoft : colors.epic} />
                      <TextInput
                        value={t.title}
                        onChangeText={(v) => patchTask(ci, ti, { title: v })}
                        placeholder={t.boss ? 'Boss: build something real' : 'Quest'}
                        placeholderTextColor={colors.textDone}
                        style={[styles.input, { flex: 1, minHeight: 42 }]}
                        accessibilityLabel={`${t.boss ? 'Boss' : 'Quest'} title`}
                      />
                      {!t.doneDay ? (
                        <Pressable onPress={() => removeTask(ci, ti)} style={styles.iconBtn} accessibilityLabel="Remove quest">
                          <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.wrap}>
                      {!t.boss
                        ? TASK_TYPES.map((ty) => (
                            <Chip key={ty} label={TYPE_LABEL[ty]} selected={t.type === ty} onPress={() => patchTask(ci, ti, { type: ty })} />
                          ))
                        : null}
                      <Chip
                        label={`Grade ${t.grade}`}
                        selected
                        onPress={() => patchTask(ci, ti, { grade: GRADES[(GRADES.indexOf(t.grade) + 1) % GRADES.length] })}
                        accessibilityLabel={`Grade ${t.grade}, tap to change`}
                      />
                      <TextInput
                        value={t.target ? String(t.target) : ''}
                        onChangeText={(v) => patchTask(ci, ti, { target: v ? Number(v.replace(/[^0-9]/g, '')) || null : null })}
                        placeholder="×count"
                        placeholderTextColor={colors.textDone}
                        keyboardType="number-pad"
                        style={[styles.input, styles.count]}
                        accessibilityLabel="Count (optional)"
                      />
                    </View>
                    <SysText variant="caption" style={{ fontSize: 11 }}>
                      +{taskXp(t)} EXP{t.doneDay ? ` · done ${t.doneDay}` : ''}
                    </SysText>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SysButton label="+ QUEST" variant="ghost" style={{ flex: 1 }} onPress={() => addTask(ci)} />
                  <SysButton label={hasBoss ? '− BOSS' : '+ BOSS'} variant="ghost" style={{ flex: 1 }} onPress={() => toggleBoss(ci)} />
                </View>
                <TextInput
                  value={ch.bounty ?? ''}
                  onChangeText={(t) => patchChapter(ci, { bounty: t })}
                  placeholder="Chapter bounty (optional): buy that book"
                  placeholderTextColor={colors.textDone}
                  style={styles.input}
                  accessibilityLabel={`Chapter ${ci + 1} bounty`}
                />
                {data.chapters.length > 1 ? (
                  <SysText variant="caption" style={{ fontSize: 11 }}>
                    Clearing it awards a {chapterRarity(ch)} item.
                  </SysText>
                ) : null}
                {data.chapters.length > 1 && ch.tasks.every((t) => !t.doneDay) ? (
                  <SysButton
                    label="REMOVE CHAPTER"
                    variant="ghost"
                    onPress={() => setData((d) => ({ ...d, chapters: d.chapters.filter((_, i) => i !== ci) }))}
                  />
                ) : null}
              </SystemWindow>
            );
          })}

          <SysButton
            label="+ CHAPTER"
            variant="ghost"
            onPress={() => setData((d) => ({ ...d, chapters: [...d.chapters, blankChapter(d.chapters.length + 1)] }))}
          />
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            {data.chapters.length} chapter{data.chapters.length === 1 ? '' : 's'} · {tasks.length} quests · {xp} EXP · finish for a{' '}
            {questRarity(data)} item
          </SysText>
          <SysButton label={isNew ? 'ACCEPT MAIN QUEST' : 'SAVE'} disabled={!valid} onPress={save} />
          {!isNew ? <SysButton label="DELETE" variant="ghost" onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text }: { text: string }) {
  return (
    <SysText variant="label" style={{ fontSize: 13 }}>
      {text}
    </SysText>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
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
  count: { width: 84, minHeight: 36, textAlign: 'center', fontSize: 13 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  task: { borderWidth: 1, borderColor: colors.borderMuted, padding: 8, gap: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
