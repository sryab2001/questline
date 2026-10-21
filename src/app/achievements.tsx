import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RARITY_COLOR } from '@/components/gain-toast';
import { ProgressBar } from '@/components/progress-bar';
import { ScreenHeader } from '@/components/screen-header';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { ACHIEVEMENTS, describeEffect, type Rarity } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

const EFFECT = new Map(ACHIEVEMENTS.map((a) => [a.id, a.titleEffect]));

export default function AchievementsScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const list = player.state.achievements;
  const unlocked = list.filter((a) => a.unlockedDay).length;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="ACHIEVEMENTS" right={<SysText variant="caption">{unlocked} / {list.length}</SysText>} />
        {list.map((a) => {
          const done = !!a.unlockedDay;
          const effect = EFFECT.get(a.id);
          return (
            <SystemWindow key={a.id} title={done ? 'UNLOCKED' : 'LOCKED'} variant={done ? 'gold' : 'system'}>
              <View style={styles.head}>
                <MaterialCommunityIcons name={done ? 'trophy' : 'trophy-outline'} size={24} color={done ? colors.gold : colors.textDone} />
                <View style={{ flex: 1 }}>
                  <SysText style={[styles.title, { color: done ? colors.gold : colors.text }]}>[{a.title}]</SysText>
                  <SysText variant="caption">{a.description}</SysText>
                </View>
              </View>
              {!done ? (
                <View style={{ gap: 4 }}>
                  <ProgressBar value={a.progress / a.target} height={4} glow={false} />
                  <SysText variant="caption" style={{ fontSize: 11, textAlign: 'right' }}>
                    {Math.min(a.progress, a.target)} / {a.target}
                  </SysText>
                </View>
              ) : (
                <SysText variant="caption" style={{ fontSize: 11 }}>
                  Unlocked {a.unlockedDay}
                </SysText>
              )}
              <View style={styles.rewards}>
                {effect ? <SysText style={styles.reward}>Title: {describeEffect(effect)}</SysText> : null}
                {a.allStats > 0 ? <SysText style={[styles.reward, { color: colors.cyan }]}>All stats +{a.allStats}</SysText> : null}
                {a.itemRarity ? (
                  <SysText style={[styles.reward, { color: RARITY_COLOR[a.itemRarity as Rarity] }]}>[{a.itemRarity}] item</SysText>
                ) : null}
              </View>
            </SystemWindow>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 18 },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  reward: { fontSize: 12, color: colors.textMuted },
});
