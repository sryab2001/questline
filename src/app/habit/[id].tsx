import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addHabits, deleteHabit, getHabit, type HabitInput, recordScreenTime, updateHabit } from '@/db/actions';
import { GOAL_XP, type Grade, GRADES, type Stat, STAT_INFO, STATS } from '@/engine';
import { hasUsageAccess, openUsageAccessSettings, screenTimeAvailable } from '@/screen-time';
import { colors, fonts } from '@/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LIMIT_PRESETS = [60, 120, 180, 240];
const limitName = (minutes: number) => `Phone under ${minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`}`;

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
  const [cue, setCue] = useState('');
  const [place, setPlace] = useState('');
  const [bundle, setBundle] = useState('');
  const [minTarget, setMinTarget] = useState('');
  /** Limit Quest: kept by staying under a daily screen-time limit. */
  const [limit, setLimit] = useState(false);
  const [access, setAccess] = useState(hasUsageAccess);

  // Coming back from the Usage access settings page: check again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setAccess(hasUsageAccess());
    });
    return () => sub.remove();
  }, []);

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
      setCue(h.cue);
      setPlace(h.place);
      setBundle(h.bundle);
      setMinTarget(h.minTarget ? String(h.minTarget) : '');
      setLimit(h.limitSource === 'screen_time');
      setLoaded(true);
    });
  }, [id, isNew]);

  const targetNum = simple && !limit ? 1 : Number(target.replace(',', '.'));
  const minNum = minTarget.trim() && !limit ? Number(minTarget.replace(',', '.')) : null;
  const minValid = minNum === null || (Number.isFinite(minNum) && minNum > 0 && minNum < targetNum);
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(targetNum) &&
    targetNum > 0 &&
    minValid &&
    (days === 'daily' || days.length > 0) &&
    (!limit || access);

  const what = name.trim() || 'this quest';
  const action = simple ? what.toLowerCase() : [`do ${target}`, unit.trim(), `of ${what}`].filter(Boolean).join(' ');
  const triggerLine = `After I ${cue.trim()}, I will ${action}${place.trim() ? ` (${place.trim()})` : ''}.`;

  const chooseKind = (asLimit: boolean) => {
    setLimit(asLimit);
    if (asLimit) {
      setSimple(false);
      setUnit('min');
      if (!LIMIT_PRESETS.includes(Number(target))) setTarget('180');
      if (!name.trim()) setName(limitName(180));
      setStat('SENSE');
      setGrade('C');
    }
  };

  const setLimitMinutes = (m: number) => {
    // Keep an auto-generated name in step with the limit; leave a custom name alone.
    if (!name.trim() || name === limitName(Number(target))) setName(limitName(m));
    setTarget(String(m));
  };

  const save = async () => {
    const input: HabitInput = {
      name: name.trim(),
      stat,
      target: targetNum,
      unit: limit ? 'min' : simple ? '' : unit.trim(),
      limitSource: limit ? 'screen_time' : '',
      grade,
      schedule: days === 'daily' ? 'daily' : [...days].sort().join(','),
      cue: cue.trim(),
      place: place.trim(),
      bundle: bundle.trim(),
      minTarget: simple || limit ? null : minNum,
    };
    if (isNew) await addHabits([input]);
    else await updateHabit(id, input);
    if (limit) await recordScreenTime();
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
            {screenTimeAvailable() ? (
              <Field label="KIND">
                <View style={styles.wrap}>
                  <Chip label="Do something" selected={!limit} onPress={() => chooseKind(false)} />
                  <Chip label="Screen-time limit" selected={limit} onPress={() => chooseKind(true)} accent={colors.epic} />
                </View>
              </Field>
            ) : null}
            {limit ? (
              <View style={[styles.limitBox, access && { borderColor: colors.epic }]}>
                <SysText style={{ fontSize: 13, lineHeight: 19, color: colors.text }}>
                  Kept by staying under a daily limit of total phone time. Usage is read from Android, on this phone only;
                  nothing to log.
                </SysText>
                {access ? (
                  <SysText style={{ fontSize: 12, color: colors.epic }}>Usage access granted.</SysText>
                ) : (
                  <>
                    <SysText style={{ fontSize: 12, color: colors.dangerSoft }}>
                      Needs Usage access: find Questline in the list and allow it.
                    </SysText>
                    <SysButton label="GRANT USAGE ACCESS" variant="ghost" onPress={() => openUsageAccessSettings()} />
                  </>
                )}
              </View>
            ) : null}
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

            {limit ? (
              <Field label="DAILY LIMIT" hint={`${target} min`}>
                <View style={styles.wrap}>
                  {LIMIT_PRESETS.map((m) => (
                    <Chip key={m} label={m % 60 === 0 ? `${m / 60} h` : `${m} min`} selected={Number(target) === m} onPress={() => setLimitMinutes(m)} />
                  ))}
                </View>
                <TextInput
                  value={target}
                  onChangeText={(t) => setLimitMinutes(Number(t.replace(/[^0-9]/g, '')) || 0)}
                  keyboardType="number-pad"
                  style={styles.input}
                  accessibilityLabel="Daily limit in minutes"
                />
              </Field>
            ) : null}

            <View style={[styles.switchRow, limit && { display: 'none' }]}>
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

            {!simple && !limit ? (
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

          {!limit ? (
          <SystemWindow title="TRIGGER">
            <SysText variant="caption" style={{ lineHeight: 18 }}>
              Tie the quest to something you already do. If-then plans make follow-through much more likely, and the cue,
              not the app, is what turns it into a habit.
            </SysText>
            <Field label="AFTER I…">
              <TextInput
                value={cue}
                onChangeText={setCue}
                placeholder="brush my teeth in the morning"
                placeholderTextColor={colors.textDone}
                style={styles.input}
                accessibilityLabel="Trigger: after I"
              />
            </Field>
            <Field label="WHERE (OPTIONAL)">
              <TextInput
                value={place}
                onChangeText={setPlace}
                placeholder="bedroom floor"
                placeholderTextColor={colors.textDone}
                style={styles.input}
                accessibilityLabel="Place"
              />
            </Field>
            {cue.trim() ? <SysText style={styles.preview}>{triggerLine}</SysText> : null}
          </SystemWindow>
          ) : null}

          {!limit ? (
          <SystemWindow title="BAD DAYS">
            {!simple ? (
              <Field label="MINIMUM CLEAR" hint="Keeps your streak">
                <TextInput
                  value={minTarget}
                  onChangeText={setMinTarget}
                  placeholder={`e.g. ${Math.max(1, Math.round(targetNum * 0.2) || 1)}`}
                  placeholderTextColor={colors.textDone}
                  keyboardType="numeric"
                  style={styles.input}
                  accessibilityLabel="Minimum clear amount"
                />
              </Field>
            ) : null}
            {!minValid ? <SysText style={{ color: colors.dangerSoft, fontSize: 12 }}>The minimum must be smaller than the target.</SysText> : null}
            <Field label="ONLY WHILE… (OPTIONAL)" hint="Pair it with a treat">
              <TextInput
                value={bundle}
                onChangeText={setBundle}
                placeholder="listening to my audiobook"
                placeholderTextColor={colors.textDone}
                style={styles.input}
                accessibilityLabel="Only while"
              />
            </Field>
          </SystemWindow>
          ) : null}

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
  preview: { fontSize: 13, lineHeight: 20, color: colors.cyan, fontFamily: fonts.bodyMedium },
  limitBox: { gap: 8, borderWidth: 1, borderColor: colors.dangerSoft, padding: 10 },
});
