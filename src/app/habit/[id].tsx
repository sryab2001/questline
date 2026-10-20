import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addHabits, deleteHabit, getHabit, type HabitInput, updateHabit } from '@/db/actions';
import { GOAL_XP, type Grade, GRADES, type Stat, STAT_INFO, STATS } from '@/engine';
import { colors, fonts } from '@/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function HabitEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [stat, setStat] = useState<Stat>('STR');
  const [simple, setSimple] = useState(false);
  const [target, setTarget] = useState('10');
  const [unit, setUnit] = useState('');
  const [grade, setGrade] = useState<Grade>('E');
  const [days, setDays] = useState<number[] | 'daily'>('daily');

  useEffect(() => {
    if (isNew) return;
    getHabit(id).then((h) => {
      if (!h) return router.back();
      setName(h.name);
      setStat(h.stat);
      setSimple(h.target === 1 && !h.unit);
      setTarget(String(h.target));
      setUnit(h.unit);
      setGrade(h.grade);
      setDays(h.schedule === 'daily' ? 'daily' : h.schedule.split(',').map(Number));
      setLoaded(true);
    });
  }, [id, isNew]);

  const targetNum = simple ? 1 : Number(target.replace(',', '.'));
  const valid = name.trim().length > 0 && Number.isFinite(targetNum) && targetNum > 0 && (days === 'daily' || days.length > 0);

  const save = async () => {
    const input: HabitInput = {
      name: name.trim(),
      stat,
      target: targetNum,
      unit: simple ? '' : unit.trim(),
      grade,
      schedule: days === 'daily' ? 'daily' : [...days].sort().join(','),
    };
    if (isNew) await addHabits([input]);
    else await updateHabit(id, input);
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete quest?', `"${name}" will be removed from your Daily Quest. Past results are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteHabit(id);
          router.back();
        },
      },
    ]);

  const toggleDay = (d: number) => {
    const current = days === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : days;
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    setDays(next.length === 7 ? 'daily' : next);
  };

  if (!loaded) return <SafeAreaView style={styles.screen} />;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title={isNew ? 'NEW QUEST' : 'EDIT QUEST'} />
          <SystemWindow title="QUEST SETUP">
            <Field label="NAME">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Push-ups"
                placeholderTextColor={colors.textDone}
                style={styles.input}
                autoFocus={isNew}
                accessibilityLabel="Quest name"
              />
            </Field>

            <Field label="STAT IT TRAINS" hint={STAT_INFO[stat].source}>
              <View style={styles.wrap}>
                {STATS.map((s) => (
                  <Chip key={s} label={s} selected={s === stat} onPress={() => setStat(s)} accessibilityLabel={STAT_INFO[s].name} />
                ))}
              </View>
            </Field>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <SysText style={{ fontSize: 14, color: colors.text }}>Simple check</SysText>
                <SysText variant="caption">Done or not done, no amount</SysText>
              </View>
              <Switch
                value={simple}
                onValueChange={setSimple}
                trackColor={{ true: colors.borderDone, false: colors.borderMuted }}
                thumbColor={simple ? colors.cyan : colors.textMuted}
                accessibilityLabel="Simple check"
              />
            </View>

            {!simple ? (
              <View style={styles.wrap}>
                <Field label="TARGET" style={{ flex: 1 }}>
                  <TextInput
                    value={target}
                    onChangeText={setTarget}
                    keyboardType="numeric"
                    style={styles.input}
                    accessibilityLabel="Daily target"
                  />
                </Field>
                <Field label="UNIT" style={{ flex: 1 }}>
                  <TextInput
                    value={unit}
                    onChangeText={setUnit}
                    placeholder="reps, km, pages"
                    placeholderTextColor={colors.textDone}
                    style={styles.input}
                    accessibilityLabel="Unit"
                  />
                </Field>
              </View>
            ) : null}

            <Field label="DIFFICULTY" hint={`+${GOAL_XP[grade]} EXP per clear`}>
              <View style={styles.wrap}>
                {GRADES.map((g) => (
                  <Chip key={g} label={g} selected={g === grade} onPress={() => setGrade(g)} accessibilityLabel={`Grade ${g}`} />
                ))}
              </View>
            </Field>

            <Field label="SCHEDULE" hint={days === 'daily' ? 'Every day' : `${days.length} day${days.length === 1 ? '' : 's'} a week`}>
              <View style={styles.wrap}>
                {WEEKDAYS.map((d, i) => (
                  <Chip
                    key={i}
                    label={d}
                    selected={days === 'daily' || days.includes(i)}
                    onPress={() => toggleDay(i)}
                    accessibilityLabel={WEEKDAY_NAMES[i]}
                  />
                ))}
              </View>
            </Field>
          </SystemWindow>

          <SysButton label={isNew ? 'ACCEPT QUEST' : 'SAVE'} onPress={save} disabled={!valid} />
          {!isNew ? <SysButton label="DELETE QUEST" variant="ghost" onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, hint, style, children }: { label: string; hint?: string; style?: object; children: React.ReactNode }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SysText variant="label" style={{ fontSize: 13 }}>
          {label}
        </SysText>
        {hint ? <SysText variant="caption">{hint}</SysText> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
