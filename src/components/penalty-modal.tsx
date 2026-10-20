import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { acknowledgeDays } from '@/db/actions';
import type { DaySummary } from '@/engine';
import { colors, fonts } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

function prettyDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function PenaltyModal({ failures }: { failures: DaySummary[] }) {
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const xpLost = failures.reduce((s, d) => s + d.xpLost, 0);
  const hpLost = failures.reduce((s, d) => s - d.hpChange, 0);
  const accept = () => acknowledgeDays(failures.map((d) => d.day));
  const single = failures.length === 1;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={accept} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow
          variant="danger"
          title="WARNING"
          pulse
          icon={<MaterialCommunityIcons name="alert-outline" size={18} color={colors.danger} />}>
          <SysText style={styles.lead}>
            {single ? 'You have failed to complete the ' : `You have failed ${failures.length} Daily Quests, including the `}
            <SysText style={[styles.lead, { color: colors.dangerSoft, fontFamily: fonts.bodySemi }]}>
              [Daily Quest: Preparation to Become Powerful]
            </SysText>
            .
          </SysText>

          <View style={styles.block}>
            <SysText style={styles.blockTitle}>PENALTY APPLIED</SysText>
            <Line label="EXP" value={`−${xpLost}`} danger />
            <Line label="HP (streak health)" value={`−${hpLost}`} danger />
            <Line label="Streak" value="Reset to 0" />
          </View>

          <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={styles.block}>
            <SysText style={styles.blockTitle}>UNFINISHED GOALS</SysText>
            {failures.map((d) => (
              <View key={d.day} style={{ gap: 2 }}>
                <SysText variant="caption" style={{ color: '#e0a9b0' }}>
                  {prettyDay(d.day)} · {d.cleared}/{d.total} cleared
                </SysText>
                <SysText style={{ fontSize: 14, color: '#fbe9eb' }}>{d.missed.join(', ')}</SysText>
              </View>
            ))}
          </ScrollView>

          <SysButton label="ACCEPT PENALTY" variant="danger" onPress={accept} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

function Line({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <SysText style={{ fontSize: 14, color: '#e0a9b0' }}>{label}</SysText>
      <SysText style={{ fontSize: 14, fontFamily: fonts.bodySemi, color: danger ? colors.dangerSoft : '#fbe9eb' }}>{value}</SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,3,5,0.96)', justifyContent: 'center', padding: 20 },
  lead: { textAlign: 'center', fontSize: 15, lineHeight: 23, color: '#fbe9eb' },
  block: { gap: 8, borderTopWidth: 1, borderTopColor: '#4a1a24', paddingTop: 12 },
  blockTitle: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 2.8, color: '#e0a9b0' },
});
