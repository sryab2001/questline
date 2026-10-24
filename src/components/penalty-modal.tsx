import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { acknowledgeDays, setSurvival } from '@/db/actions';
import { type DaySummary, nextResetAt, startSurvival, SURVIVAL_HOURS } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { playEvent } from '@/sound';
import { colors, fonts } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

export function prettyDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function PenaltyModal({ failures }: { failures: DaySummary[] }) {
  const player = usePlayerState();

  useEffect(() => {
    playEvent('penalty');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const xpLost = failures.reduce((s, d) => s + d.xpLost, 0);
  const hpLost = failures.reduce((s, d) => s - d.hpChange, 0);
  const single = failures.length === 1;
  // A lone first miss is a Slip: firm but forgiving. Any second-in-a-row miss is a Failure.
  const slipOnly = failures.every((d) => d.kind === 'slip');
  const latest = failures[failures.length - 1];

  // The penalty quest can only be offered for the most recent failure, and only
  // if today still has goals to clear and no other penalty quest is running.
  const offer = (at: Date) =>
    player && !player.activeSurvival && !player.state.today.rested
      ? startSurvival(
          latest.missed.length,
          player.state.today.cleared,
          player.state.today.total,
          at.getTime(),
          nextResetAt(at, player.settings.resetHour).getTime(),
        )
      : null;
  const quest = player ? offer(player.now) : null;

  const takeFull = () => acknowledgeDays(failures.map((d) => d.day));
  const acceptQuest = async () => {
    // Start the clock now, not when the screen first rendered.
    const started = offer(new Date());
    if (!started) return;
    await setSurvival(latest.day, started);
    await takeFull();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={takeFull} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow
          variant={slipOnly ? 'gold' : 'danger'}
          title={slipOnly ? 'SLIP' : 'WARNING'}
          pulse
          icon={<MaterialCommunityIcons name="alert-outline" size={18} color={slipOnly ? colors.gold : colors.danger} />}>
          {slipOnly ? (
            <SysText style={[styles.lead, { color: '#ffe2a3' }]}>
              One slip does not break a Player.{'\n'}
              <SysText style={[styles.lead, { color: colors.gold, fontFamily: fonts.bodySemi }]}>Do not miss twice.</SysText>
            </SysText>
          ) : null}
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
            <Line label="Streak" value={slipOnly ? 'Kept: clear today to repair it' : 'Reset to 0'} />
          </View>

          <ScrollView style={{ maxHeight: 150 }} contentContainerStyle={styles.block}>
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

          {quest ? (
            <View style={styles.questBox}>
              <SysText style={[styles.blockTitle, { color: colors.dangerSoft }]}>PENALTY QUEST: SURVIVAL</SysText>
              <SysText style={{ fontSize: 13, lineHeight: 19, color: '#fbe9eb' }}>
                Clear {quest.required - (player?.state.today.cleared ?? 0)} of today&apos;s goals within {SURVIVAL_HOURS} hours to halve
                the penalty for {prettyDay(latest.day)}.
              </SysText>
            </View>
          ) : null}

          {quest ? <SysButton label="ACCEPT PENALTY QUEST" variant="danger" onPress={acceptQuest} /> : null}
          <SysButton
            label={quest ? 'TAKE FULL PENALTY' : slipOnly ? 'UNDERSTOOD' : 'ACCEPT PENALTY'}
            variant={quest ? 'ghost' : slipOnly ? 'gold' : 'danger'}
            onPress={takeFull}
          />
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
  questBox: { gap: 6, backgroundColor: '#2a0e16', borderWidth: 1, borderColor: '#4a1a24', padding: 12 },
});
