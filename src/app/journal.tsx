import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { deleteJournal, saveJournal } from '@/db/actions';
import { type JournalEntry, usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;
const MOOD: { icon: Icon; label: string }[] = [
  { icon: 'emoticon-cry-outline', label: 'Awful' },
  { icon: 'emoticon-sad-outline', label: 'Low' },
  { icon: 'emoticon-neutral-outline', label: 'Okay' },
  { icon: 'emoticon-happy-outline', label: 'Good' },
  { icon: 'emoticon-excited-outline', label: 'Great' },
];
const ENERGY: { icon: Icon; label: string }[] = [
  { icon: 'battery-10', label: 'Drained' },
  { icon: 'battery-30', label: 'Tired' },
  { icon: 'battery-50', label: 'Steady' },
  { icon: 'battery-80', label: 'Energised' },
  { icon: 'battery-charging-100', label: 'Charged' },
];
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** An optional daily journal: a few lines, and how you felt. No streak, no reminders. */
export default function JournalScreen() {
  const player = usePlayerState();
  const [editing, setEditing] = useState<string | null>(null);
  if (!player) return null;
  const day = editing ?? player.today;
  const entry = player.journal.find((j) => j.day === day);

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="JOURNAL" />
          {/* Remount the editor per day so it starts from that day's entry. */}
          <Editor key={day} day={day} isToday={day === player.today} entry={entry} onDone={() => setEditing(null)} />
          <SysText variant="caption" style={{ fontSize: 11, lineHeight: 16 }}>
            Optional, no streak. Synced to your own server. The AI report reads it only if you allow it in Settings → Sync
            {player.settings.aiReadsWriting ? ' (currently allowed)' : ''}. Mood and energy ratings feed the Hunter Analysis on this phone.
          </SysText>

          {player.journal.filter((j) => j.day !== day).length ? (
            <SystemWindow title="PAST ENTRIES">
              {player.journal
                .filter((j) => j.day !== day)
                .map((j) => (
                  <Pressable key={j.id} onPress={() => setEditing(j.day)} style={styles.past} accessibilityRole="button" accessibilityLabel={`Edit ${dayLabel(j.day)}`}>
                    <View style={styles.row}>
                      <SysText style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{dayLabel(j.day)}</SysText>
                      {j.mood ? <MaterialCommunityIcons name={MOOD[j.mood - 1].icon} size={18} color={colors.epic} /> : null}
                      {j.energy ? <MaterialCommunityIcons name={ENERGY[j.energy - 1].icon} size={18} color={colors.cyan} /> : null}
                    </View>
                    {j.text ? (
                      <SysText style={{ fontSize: 13, color: colors.textSoft }} numberOfLines={2}>
                        {j.text}
                      </SysText>
                    ) : null}
                  </Pressable>
                ))}
            </SystemWindow>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Editor({ day, isToday, entry, onDone }: { day: string; isToday: boolean; entry?: JournalEntry; onDone: () => void }) {
  const [mood, setMood] = useState(entry?.mood ?? 0);
  const [energy, setEnergy] = useState(entry?.energy ?? 0);
  const [text, setText] = useState(entry?.text ?? '');
  const [saved, setSaved] = useState(false);
  const changed = mood !== (entry?.mood ?? 0) || energy !== (entry?.energy ?? 0) || text.trim() !== (entry?.text ?? '');

  const save = async () => {
    await saveJournal(entry?.id ?? null, day, mood, energy, text);
    setSaved(true);
    if (!isToday) onDone();
  };
  const remove = () =>
    Alert.alert('Delete this entry?', dayLabel(day), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteJournal(entry!.id);
          onDone();
        },
      },
    ]);

  return (
    <SystemWindow title={isToday ? 'TODAY' : dayLabel(day).toUpperCase()} variant="epic">
      <Scale label="MOOD" options={MOOD} value={mood} onChange={(v) => setMood(v === mood ? 0 : v)} color={colors.epic} />
      <Scale label="ENERGY" options={ENERGY} value={energy} onChange={(v) => setEnergy(v === energy ? 0 : v)} color={colors.cyan} />
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setSaved(false);
        }}
        multiline
        placeholder="What's on your mind? What went well, what didn't, what you noticed."
        placeholderTextColor={colors.textDone}
        style={styles.input}
        accessibilityLabel="Journal entry"
      />
      <SysButton label={saved && !changed ? 'SAVED' : 'SAVE'} disabled={!changed && !!entry} onPress={save} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {!isToday ? <SysButton label="BACK TO TODAY" variant="ghost" style={{ flex: 1 }} onPress={onDone} /> : null}
        {entry ? <SysButton label="DELETE" variant="ghost" style={{ flex: 1 }} onPress={remove} /> : null}
      </View>
    </SystemWindow>
  );
}

function Scale({
  label,
  options,
  value,
  onChange,
  color,
}: {
  label: string;
  options: { icon: Icon; label: string }[];
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <SysText variant="label" style={{ flex: 1, fontSize: 12 }}>
          {label}
        </SysText>
        <SysText variant="caption" style={{ fontSize: 12, color }}>
          {value ? options[value - 1].label : 'Not rated'}
        </SysText>
      </View>
      <View style={styles.scale}>
        {options.map((o, i) => {
          const on = value === i + 1;
          return (
            <Pressable
              key={o.label}
              onPress={() => onChange(i + 1)}
              style={[styles.scaleBtn, on && { borderColor: color, backgroundColor: colors.panelRowDone }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label}: ${o.label}`}>
              <MaterialCommunityIcons name={o.icon} size={24} color={on ? color : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scale: { flexDirection: 'row', gap: 6 },
  scaleBtn: { flex: 1, height: 48, borderWidth: 1, borderColor: colors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  past: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 8 },
});
