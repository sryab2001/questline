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
import { type ClassStep, deleteClassQuest, saveClassQuest } from '@/db/actions';
import { classQuestRarity, CLASS_STEP_XP_MULT, GOAL_XP, type Grade, GRADES } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

interface DraftStep {
  title: string;
  grade: Grade;
  target: string;
  count?: number;
  doneDay: string | null;
}

const blank = (grade: Grade = 'D'): DraftStep => ({ title: '', grade, target: '', doneDay: null });

export default function ClassQuestEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = usePlayerState();
  const isNew = id === 'new';
  const existing = isNew ? undefined : player?.classQuests.find((q) => q.id === id);

  const [name, setName] = useState(existing?.name ?? '');
  const [steps, setSteps] = useState<DraftStep[]>(
    existing
      ? existing.steps.map((s) => ({ ...s, target: s.target ? String(s.target) : '' }))
      : [blank('D'), blank('C'), blank('B')],
  );

  const valid = name.trim().length > 0 && steps.length > 0 && steps.every((s) => s.title.trim() && (!s.target || Number(s.target) >= 1));
  const update = (i: number, patch: Partial<DraftStep>) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async () => {
    const out: ClassStep[] = steps.map((s) => ({
      title: s.title.trim(),
      grade: s.grade,
      target: s.target ? Math.round(Number(s.target)) : null,
      count: s.count ?? 0,
      doneDay: s.doneDay,
    }));
    await saveClassQuest(isNew ? null : id, name, out);
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this Class Quest?', 'Its progress and reward are removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteClassQuest(id);
          router.back();
        },
      },
    ]);

  const xp = steps.reduce((sum, s) => sum + GOAL_XP[s.grade] * CLASS_STEP_XP_MULT, 0);

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title={isNew ? 'NEW CLASS QUEST' : 'EDIT CLASS QUEST'} />
          <SystemWindow title="QUEST" variant="epic">
            <SysText variant="label" style={{ fontSize: 13 }}>
              NAME
            </SysText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Path of the Runner"
              placeholderTextColor={colors.textDone}
              style={styles.input}
              autoFocus={isNew}
              accessibilityLabel="Class Quest name"
            />
            <SysText variant="caption" style={{ lineHeight: 18 }}>
              Steps are done in order. Give a step a count to make it a counted goal (e.g. &quot;Read books&quot;, 12).
            </SysText>
          </SystemWindow>

          {steps.map((s, i) => (
            <SystemWindow key={i} title={`STEP ${i + 1}`}>
              <TextInput
                value={s.title}
                onChangeText={(t) => update(i, { title: t })}
                placeholder={i === 0 ? 'Run 5 km without stopping' : 'Next milestone'}
                placeholderTextColor={colors.textDone}
                style={styles.input}
                accessibilityLabel={`Step ${i + 1} title`}
                editable={!s.doneDay}
              />
              <View style={styles.wrap}>
                {GRADES.map((g) => (
                  <Chip key={g} label={g} selected={s.grade === g} onPress={() => update(i, { grade: g })} accessibilityLabel={`Grade ${g}`} />
                ))}
              </View>
              <View style={styles.row}>
                <SysText variant="caption" style={{ flex: 1 }}>
                  Count (optional)
                </SysText>
                <TextInput
                  value={s.target}
                  onChangeText={(t) => update(i, { target: t.replace(/[^0-9]/g, '') })}
                  placeholder="—"
                  placeholderTextColor={colors.textDone}
                  keyboardType="number-pad"
                  style={[styles.input, { width: 90, textAlign: 'center' }]}
                  accessibilityLabel={`Step ${i + 1} count`}
                />
                {steps.length > 1 && !s.doneDay ? (
                  <Pressable
                    onPress={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    style={styles.iconBtn}
                    accessibilityLabel={`Remove step ${i + 1}`}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.dangerSoft} />
                  </Pressable>
                ) : null}
              </View>
              {s.doneDay ? <SysText variant="caption">Done on {s.doneDay}</SysText> : null}
            </SystemWindow>
          ))}

          <SysButton label="+ ADD STEP" variant="ghost" onPress={() => setSteps((prev) => [...prev, blank(prev.at(-1)?.grade ?? 'C')])} />
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            {steps.length} steps · {xp} EXP over the chain · reward: a {classQuestRarity(steps.length)} item
          </SysText>
          <SysButton label={isNew ? 'ACCEPT CLASS QUEST' : 'SAVE'} disabled={!valid} onPress={save} />
          {!isNew ? <SysButton label="DELETE" variant="ghost" onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
