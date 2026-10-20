import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HourStepper } from '@/components/hour-stepper';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addHabits, type HabitInput, updateSettings } from '@/db/actions';
import { STAT_INFO } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { setupNotifications } from '@/notifications';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

const STARTERS: HabitInput[] = [
  { name: 'Push-ups', stat: 'STR', target: 50, unit: 'reps', grade: 'E', schedule: 'daily' },
  { name: 'Squats', stat: 'STR', target: 50, unit: 'reps', grade: 'E', schedule: 'daily' },
  { name: 'Run', stat: 'AGI', target: 3, unit: 'km', grade: 'D', schedule: 'daily' },
  { name: 'Walk', stat: 'AGI', target: 8000, unit: 'steps', grade: 'E', schedule: 'daily' },
  { name: 'Drink water', stat: 'STA', target: 2, unit: 'L', grade: 'F', schedule: 'daily' },
  { name: 'Sleep before 23:00', stat: 'STA', target: 1, unit: '', grade: 'E', schedule: 'daily' },
  { name: 'Read', stat: 'INT', target: 10, unit: 'pages', grade: 'E', schedule: 'daily' },
  { name: 'Study', stat: 'INT', target: 30, unit: 'min', grade: 'D', schedule: 'daily' },
  { name: 'Meditate', stat: 'SENSE', target: 5, unit: 'min', grade: 'E', schedule: 'daily' },
  { name: 'Journal', stat: 'SENSE', target: 1, unit: '', grade: 'F', schedule: 'daily' },
];

const DEFAULT_PICKS = new Set(['Push-ups', 'Run', 'Read']);

export default function Awakening() {
  const player = usePlayerState();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(DEFAULT_PICKS);
  const [resetHour, setResetHour] = useState(0);
  const [morningHour, setMorningHour] = useState(7);
  const [warningHour, setWarningHour] = useState(21);
  const [finishing, setFinishing] = useState(false);

  // Restored from the server (or quests exist already)? Nothing to set up.
  const alreadyPlayer = !!player && (player.settings.onboarded || player.habits.length > 0);
  useEffect(() => {
    if (alreadyPlayer && !finishing) router.replace('/');
  }, [alreadyPlayer, finishing]);

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep((s) => s + 1);
  };

  const toggle = (n: string) =>
    setPicked((prev) => {
      const copy = new Set(prev);
      if (copy.has(n)) copy.delete(n);
      else copy.add(n);
      return copy;
    });

  const begin = async () => {
    setFinishing(true);
    await addHabits(STARTERS.filter((h) => picked.has(h.name)));
    await updateSettings({ playerName: name.trim() || 'Hunter', resetHour, morningHour, warningHour, onboarded: true });
    await setupNotifications().catch(() => false);
    playSound('quest');
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.dot, i <= step && { backgroundColor: colors.cyan, borderColor: colors.cyan }]} />
            ))}
          </View>

          <Animated.View key={step} entering={FadeInDown.duration(450)} style={{ gap: 20 }}>
            {step === 0 ? (
              <>
                <Animated.View entering={FadeIn.duration(1200)} style={{ alignItems: 'center', gap: 8, paddingTop: 24 }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={56} color={colors.cyan} />
                  <SysText variant="label">SYSTEM</SysText>
                </Animated.View>
                <SystemWindow title="NOTIFICATION" pulse>
                  <SysText style={styles.big}>[You have acquired the qualifications to be a Player.]</SysText>
                  <SysText style={styles.center}>Will you accept?</SysText>
                </SystemWindow>
                <SysButton label="ACCEPT" onPress={next} />
                <Pressable onPress={() => router.push('/settings')} style={styles.link} accessibilityRole="link">
                  <SysText variant="caption" style={{ color: colors.cyan }}>
                    Already a Player? Restore from your server
                  </SysText>
                </Pressable>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <SystemWindow title="REGISTRATION">
                  <SysText style={styles.big}>Player, what is your name?</SysText>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Hunter"
                    placeholderTextColor={colors.textDone}
                    style={styles.input}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={next}
                    accessibilityLabel="Player name"
                  />
                </SystemWindow>
                <SysButton label="CONFIRM" onPress={next} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <SystemWindow title="DAILY QUEST SETUP">
                  <SysText style={styles.center}>Choose your first goals. You can change targets and add your own later.</SysText>
                  <View style={{ gap: 8 }}>
                    {STARTERS.map((h) => {
                      const on = picked.has(h.name);
                      return (
                        <Pressable
                          key={h.name}
                          onPress={() => toggle(h.name)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={[styles.pick, on && { borderColor: colors.borderDone, backgroundColor: colors.panelRowDone }]}>
                          <View style={[styles.box, on && { backgroundColor: colors.cyan }]}>
                            {on ? <MaterialCommunityIcons name="check-bold" size={14} color={colors.bg} /> : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <SysText style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{h.name}</SysText>
                            <SysText variant="caption">
                              {h.target === 1 && !h.unit ? 'Daily check' : `${h.target} ${h.unit}`} · {STAT_INFO[h.stat].name}
                            </SysText>
                          </View>
                          <SysText style={styles.stat}>+{h.stat}</SysText>
                        </Pressable>
                      );
                    })}
                  </View>
                </SystemWindow>
                <SysButton label={picked.size ? `ACCEPT ${picked.size} GOAL${picked.size === 1 ? '' : 'S'}` : 'SKIP FOR NOW'} onPress={next} />
              </>
            ) : null}

            {step === 3 ? (
              <>
                <SystemWindow title="SYSTEM TIME">
                  <HourStepper label="Daily reset" hint="When a new Daily Quest begins" value={resetHour} onChange={setResetHour} />
                  <HourStepper label="Quest arrival" hint="Morning notification" value={morningHour} onChange={setMorningHour} />
                  <HourStepper label="Penalty warning" hint="If goals remain" value={warningHour} onChange={setWarningHour} />
                  <SysText variant="caption">The System will ask permission to send notifications.</SysText>
                </SystemWindow>
                <SysButton label="CONFIRM" onPress={next} />
              </>
            ) : null}

            {step === 4 ? (
              <>
                <SystemWindow title="QUEST INFO" pulse>
                  <SysText style={styles.big}>
                    [Daily Quest: <SysText style={[styles.big, { color: colors.cyan }]}>Preparation to Become Powerful</SysText>] has
                    arrived.
                  </SysText>
                  <SysText style={styles.center}>
                    Clear every goal before the reset to earn EXP, gold and ability points. Failure will result in an appropriate penalty.
                  </SysText>
                </SystemWindow>
                <SysButton label={finishing ? 'AWAKENING…' : 'BEGIN'} disabled={finishing} onPress={begin} />
              </>
            ) : null}
          </Animated.View>

          {step > 0 && step < 4 ? (
            <Pressable onPress={() => setStep((s) => s - 1)} style={styles.link} accessibilityRole="button">
              <SysText variant="caption">Back</SysText>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgDeep },
  content: { padding: 20, gap: 20, flexGrow: 1, justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 22, height: 4, borderWidth: 1, borderColor: colors.borderMuted },
  big: { fontSize: 17, lineHeight: 26, textAlign: 'center', color: colors.text, fontFamily: fonts.bodyMedium },
  center: { textAlign: 'center' },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 14,
    fontFamily: fonts.display,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
  },
  box: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stat: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.cyan },
});
