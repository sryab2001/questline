import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { RANK_MIN_LEVEL, RANKS, STAT_INFO, STATS } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

export default function StatusScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const { state, settings } = player;
  const nextRank = RANKS[RANKS.indexOf(state.rank) + 1];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <SysText variant="caption">{state.streak}-day streak</SysText>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            style={styles.gear}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <SystemWindow title="STATUS">
          <View style={styles.top}>
            <View style={styles.levelBlock}>
              <SysText variant="display">{state.level}</SysText>
              <SysText variant="label">LEVEL</SysText>
            </View>
            <View style={styles.info}>
              <InfoRow label="NAME" value={settings.playerName} />
              <InfoRow label="JOB" value="None" />
              <InfoRow label="TITLE" value="None" />
              <InfoRow label="RANK" value={state.rank} accent />
            </View>
          </View>

          <View style={{ gap: 5 }}>
            <View style={styles.barLabels}>
              <SysText variant="caption" style={{ fontSize: 11, letterSpacing: 1.1 }}>
                HP · STREAK HEALTH
              </SysText>
              <SysText variant="caption" style={{ fontSize: 11 }}>
                {state.hp} / {state.maxHp}
              </SysText>
            </View>
            <ProgressBar value={state.hp / state.maxHp} color={colors.dangerSoft} glow={false} />
          </View>

          <View style={styles.divider} />

          {STATS.map((stat) => (
            <View key={stat} style={styles.statRow}>
              <SysText style={styles.statKey}>{stat}</SysText>
              <View style={{ flex: 1, gap: 2 }}>
                <SysText variant="number">{state.stats[stat]}</SysText>
                <SysText variant="caption" style={{ fontSize: 11 }}>
                  {STAT_INFO[stat].source}
                </SysText>
              </View>
            </View>
          ))}

          {nextRank ? (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 12 }}>
              <View style={styles.barLabels}>
                <SysText variant="caption">Next rank: {nextRank}</SysText>
                <SysText variant="caption">
                  Lv. {state.level} / {RANK_MIN_LEVEL[nextRank]}
                </SysText>
              </View>
              <ProgressBar value={state.level / RANK_MIN_LEVEL[nextRank]} height={4} />
            </View>
          ) : null}
        </SystemWindow>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <SysText variant="caption" style={{ fontSize: 13 }}>
        {label}
      </SysText>
      <SysText style={{ fontSize: 13, color: accent ? colors.cyan : colors.text }}>{value}</SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  levelBlock: { alignItems: 'center', minWidth: 78 },
  info: { flex: 1, gap: 6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.borderMuted },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  statKey: { width: 64, fontFamily: fonts.display, fontSize: 17, letterSpacing: 1.7 },
});
