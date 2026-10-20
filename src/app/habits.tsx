import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import type { Habit } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleText(h: Habit) {
  if (h.schedule === 'daily') return 'Every day';
  return h.schedule.split(',').map((d) => DAY_SHORT[Number(d)]).join(', ');
}

function targetText(h: Habit) {
  return h.target === 1 && !h.unit ? 'Check' : `${h.target}${h.unit ? ` ${h.unit}` : ''}`;
}

export default function HabitsScreen() {
  const player = usePlayerState();
  if (!player) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="ALL QUESTS" />
        <SystemWindow title="QUEST LOG">
          {player.habits.length === 0 ? (
            <SysText style={{ textAlign: 'center' }}>No quests yet.</SysText>
          ) : (
            player.habits.map((h) => (
              <Link key={h.id} href={{ pathname: '/habit/[id]', params: { id: h.id } }} asChild>
                <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`Edit ${h.name}`}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <SysText style={styles.name}>{h.name}</SysText>
                    <SysText variant="caption">
                      {targetText(h)} · {scheduleText(h)} · Grade {h.grade}
                    </SysText>
                    {h.cue ? (
                      <SysText style={{ fontSize: 11, color: colors.cyan }} numberOfLines={1}>
                        After {h.cue}
                      </SysText>
                    ) : (
                      <SysText style={{ fontSize: 11, color: colors.gold }}>No trigger set: tap to add one</SysText>
                    )}
                    <SysText variant="caption" style={{ fontSize: 11 }}>
                      Strength {Math.round(player.state.habits[h.id]?.strength ?? 0)}%
                      {h.mastered ? ' · Passive Skill' : ''}
                    </SysText>
                  </View>
                  <SysText style={styles.stat}>+{h.stat}</SysText>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </Pressable>
              </Link>
            ))
          )}
        </SystemWindow>
        <Link href={{ pathname: '/habit/[id]', params: { id: 'new' } }} asChild>
          <SysButton label="+ NEW QUEST" />
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
  },
  name: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  stat: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.cyan },
});
