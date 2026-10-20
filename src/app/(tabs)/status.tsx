import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { STAT_INFO, STATS } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

export default function StatusScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const { state, playerName } = player;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SystemWindow title="STATUS">
          <View style={styles.top}>
            <View style={styles.levelBlock}>
              <SysText variant="display">{state.level}</SysText>
              <SysText variant="label">LEVEL</SysText>
            </View>
            <View style={styles.info}>
              <InfoRow label="NAME" value={playerName} />
              <InfoRow label="JOB" value="None" />
              <InfoRow label="TITLE" value="None" />
              <InfoRow label="RANK" value={state.rank} accent />
            </View>
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
  content: { padding: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  levelBlock: { alignItems: 'center', minWidth: 78 },
  info: { flex: 1, gap: 6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  divider: { height: 1, backgroundColor: colors.borderMuted },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  statKey: { width: 64, fontFamily: fonts.display, fontSize: 17, letterSpacing: 1.7 },
});
