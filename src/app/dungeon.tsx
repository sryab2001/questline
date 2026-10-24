import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ProgressBar } from '@/components/progress-bar';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { abandonDungeon, type ActiveDungeon, enterDungeon, isTimeUnit, leaveDungeon, readDungeon } from '@/dungeon';
import { usePlayerState } from '@/hooks/use-player-state';
import { playEvent, playSound } from '@/sound';
import { colors, fonts } from '@/theme';

const PRESETS = [15, 25, 45, 60];
const pad = (n: number) => String(n).padStart(2, '0');

/** Instance Dungeon: a focus timer that logs its minutes to a time-based quest. */
export default function DungeonScreen() {
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const player = usePlayerState();
  const [active, setActive] = useState<ActiveDungeon | null>(readDungeon);
  const [now, setNow] = useState(() => Date.now());
  const [cleared, setCleared] = useState<{ name: string; minutes: number } | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Time's up while watching: claim it here.
  const finished = !!active && now >= active.endsAt;
  useEffect(() => {
    if (!finished || !active) return;
    leaveDungeon().then((m) => {
      setCleared({ name: active.habitName, minutes: m });
      setActive(null);
      playEvent('dungeon');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
  }, [finished, active]);

  if (!player) return null;

  if (cleared) {
    return (
      <Shell>
        <SystemWindow title="DUNGEON CLEARED" variant="gold" pulse>
          <MaterialCommunityIcons name="gate" size={48} color={colors.gold} style={{ alignSelf: 'center' }} />
          <SysText style={styles.name}>{cleared.name}</SysText>
          <SysText style={styles.big}>+{cleared.minutes} min</SysText>
          <SysText variant="caption" style={{ textAlign: 'center' }}>
            Logged to today&apos;s quest.
          </SysText>
          <SysButton label="RETURN" variant="gold" onPress={() => router.back()} />
        </SystemWindow>
      </Shell>
    );
  }

  if (active) {
    const left = Math.max(0, active.endsAt - now);
    const spent = Math.floor((now - active.startedAt) / 60_000);
    const endEarly = () =>
      Alert.alert('Leave the Dungeon?', spent > 0 ? `${spent} min will be logged.` : 'Less than a minute in: nothing will be logged.', [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          onPress: async () => {
            const m = await leaveDungeon();
            setActive(null);
            if (m > 0) setCleared({ name: active.habitName, minutes: m });
            else router.back();
          },
        },
      ]);
    const abandon = () =>
      Alert.alert('Abandon the Dungeon?', 'Nothing is logged.', [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            await abandonDungeon();
            router.back();
          },
        },
      ]);
    return (
      <Shell>
        <SystemWindow title="INSTANCE DUNGEON" variant="epic" pulse>
          <SysText style={styles.name}>{active.habitName}</SysText>
          <SysText style={styles.timer} accessibilityLabel={`${Math.ceil(left / 60_000)} minutes left`}>
            {pad(Math.floor(left / 60_000))}:{pad(Math.floor((left % 60_000) / 1000))}
          </SysText>
          <ProgressBar value={1 - left / (active.endsAt - active.startedAt)} color={colors.epic} height={6} />
          <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
            The gate closes at {new Date(active.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. You can leave the
            app; the time still counts.
          </SysText>
          <SysButton label={spent > 0 ? `LEAVE EARLY · LOG ${spent} MIN` : 'LEAVE EARLY'} variant="ghost" onPress={endEarly} />
          <SysButton label="ABANDON" variant="ghost" onPress={abandon} />
        </SystemWindow>
      </Shell>
    );
  }

  const goal = player.state.today.goals.find((g) => g.habitId === habitId);
  const habit = player.habits.find((h) => h.id === habitId);
  if (!goal || !habit || !isTimeUnit(habit.unit)) {
    return (
      <Shell>
        <SystemWindow title="INSTANCE DUNGEON">
          <SysText style={{ textAlign: 'center' }}>Open a quest measured in minutes or hours, then choose Enter Dungeon.</SysText>
          <SysButton label="BACK" variant="ghost" onPress={() => router.back()} />
        </SystemWindow>
      </Shell>
    );
  }

  const perUnit = /^h/i.test(habit.unit.trim()) ? 60 : 1;
  const remaining = Math.max(0, Math.round((goal.target - goal.progress) * perUnit));
  const options = [...new Set([remaining, ...PRESETS].filter((m) => m > 0 && m <= 240))].sort((a, b) => a - b);
  const chosen = minutes ?? (remaining > 0 ? remaining : 25);

  const enter = async () => {
    setActive(await enterDungeon({ id: habit.id, name: habit.name, unit: habit.unit }, chosen));
    playSound('quest');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  };

  return (
    <Shell>
      <SystemWindow title="INSTANCE DUNGEON" variant="epic">
        <SysText style={styles.name}>{habit.name}</SysText>
        <SysText variant="caption" style={{ textAlign: 'center' }}>
          {remaining > 0 ? `${remaining} min left on today's quest.` : 'Today’s target is met; extra time still counts.'}
        </SysText>
        <View style={styles.wrap}>
          {options.map((m) => (
            <Chip key={m} label={m === remaining ? `${m} min · rest` : `${m} min`} selected={chosen === m} onPress={() => setMinutes(m)} accent={colors.epic} />
          ))}
        </View>
        <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
          One task, no switching. When the gate closes, the minutes are logged for you.
        </SysText>
        <SysButton label={`ENTER · ${chosen} MIN`} onPress={enter} />
      </SystemWindow>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <ScreenHeader title="DUNGEON" />
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 16 },
  name: { fontFamily: fonts.display, fontSize: 22, textAlign: 'center', color: colors.text },
  timer: { fontFamily: fonts.display, fontSize: 72, lineHeight: 86, textAlign: 'center', color: colors.epic, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  big: { fontFamily: fonts.display, fontSize: 40, lineHeight: 50, textAlign: 'center', color: colors.gold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
