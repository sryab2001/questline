import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { deleteRoutine, saveRoutine } from '@/db/actions';
import { type PlayerData, type RoutineRow, usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

/** Routines: quests chained in order ("after waking: water → push-ups → meditate"). */
export default function RoutinesScreen() {
  const player = usePlayerState();
  const [editing, setEditing] = useState<RoutineRow | 'new' | null>(null);
  if (!player) return null;
  const names = new Map(player.habits.map((h) => [h.id, h.name]));

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="ROUTINES" />
        <SysText variant="caption" style={{ lineHeight: 18 }}>
          Chain quests you do back to back. Each one becomes the cue for the next, and a run takes one tap per step.
        </SysText>
        {player.routines.map((r) => (
          <SystemWindow key={r.id} title="ROUTINE">
            <SysText style={styles.name}>{r.name}</SysText>
            <SysText variant="caption" style={{ textAlign: 'center' }}>
              {r.habitIds
                .map((id) => names.get(id))
                .filter(Boolean)
                .join(' → ') || 'No quests'}
            </SysText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SysButton label="RUN" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/routine/[id]', params: { id: r.id } })} />
              <SysButton label="EDIT" variant="ghost" style={{ flex: 1 }} onPress={() => setEditing(r)} />
            </View>
          </SystemWindow>
        ))}
        <SysButton label="+ NEW ROUTINE" variant="ghost" onPress={() => setEditing('new')} />
      </ScrollView>
      {editing ? <RoutineEditor player={player} routine={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </SafeAreaView>
  );
}

function RoutineEditor({ player, routine, onClose }: { player: PlayerData; routine: RoutineRow | null; onClose: () => void }) {
  const [name, setName] = useState(routine?.name ?? 'Morning routine');
  const [ids, setIds] = useState<string[]>(routine?.habitIds ?? []);
  // Limit Quests track themselves; they don't belong in a sequence of actions.
  const options = player.habits.filter((h) => !h.archived && !h.limit);
  const toggle = (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const move = (i: number, d: -1 | 1) =>
    setIds((p) => {
      const next = [...p];
      const j = i + d;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    await saveRoutine(routine?.id ?? null, name, ids);
    onClose();
  };
  const remove = () =>
    Alert.alert('Delete this routine?', 'Its quests stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRoutine(routine!.id);
          onClose();
        },
      },
    ]);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={routine ? 'EDIT ROUTINE' : 'NEW ROUTINE'}>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.textDone} accessibilityLabel="Routine name" />
          <SysText variant="label" style={{ fontSize: 13 }}>
            ORDER
          </SysText>
          {ids.length === 0 ? <SysText variant="caption">Tap quests below to add them in order.</SysText> : null}
          {ids.map((id, i) => (
            <View key={id} style={styles.stepRow}>
              <SysText style={styles.stepNum}>{i + 1}</SysText>
              <SysText style={{ flex: 1, fontSize: 14, color: colors.text }}>{player.habits.find((h) => h.id === id)?.name ?? '?'}</SysText>
              <Pressable onPress={() => move(i, -1)} style={styles.iconBtn} accessibilityLabel="Move up">
                <MaterialCommunityIcons name="chevron-up" size={22} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => move(i, 1)} style={styles.iconBtn} accessibilityLabel="Move down">
                <MaterialCommunityIcons name="chevron-down" size={22} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => toggle(id)} style={styles.iconBtn} accessibilityLabel="Remove">
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <SysText variant="label" style={{ fontSize: 13 }}>
            QUESTS
          </SysText>
          <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={styles.wrap}>
            {options
              .filter((h) => !ids.includes(h.id))
              .map((h) => (
                <Pressable key={h.id} onPress={() => toggle(h.id)} style={styles.pick} accessibilityRole="button">
                  <SysText style={{ fontSize: 13, color: colors.text }}>+ {h.name}</SysText>
                </Pressable>
              ))}
          </ScrollView>
          <SysButton label="SAVE" disabled={!name.trim() || ids.length < 2} onPress={save} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {routine ? <SysButton label="DELETE" variant="ghost" style={{ flex: 1 }} onPress={remove} /> : null}
            <SysButton label="CANCEL" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
          </View>
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  name: { fontFamily: fonts.display, fontSize: 20, textAlign: 'center', color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.88)', justifyContent: 'center', padding: 20 },
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
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  stepNum: { width: 22, fontFamily: fonts.display, fontSize: 16, color: colors.cyan },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { borderWidth: 1, borderColor: colors.borderMuted, paddingHorizontal: 10, paddingVertical: 8 },
});
