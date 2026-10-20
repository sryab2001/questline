import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { markSeen } from '@/db/actions';
import type { DaySummary } from '@/engine';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

/** "2026-10" → the month before. */
export function previousMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function longestRun(days: DaySummary[]) {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.kind === 'cleared' || d.kind === 'min') best = Math.max(best, ++run);
    else if (d.kind === 'failure') run = 0;
  }
  return best;
}

/** Fresh-start landmark: once a month, close the last Season and open a new one. */
export function SeasonRecapModal({ month, days, title }: { month: string; days: DaySummary[]; title: string | null }) {
  useEffect(() => {
    playSound(title ? 'levelup' : 'quest');
  }, [title]);

  const kept = days.filter((d) => d.kind === 'cleared' || d.kind === 'min').length;
  const misses = days.filter((d) => d.kind === 'slip' || d.kind === 'failure').length;
  const xp = days.reduce((s, d) => s + d.xpGained - d.xpLost, 0);
  const gold = days.reduce((s, d) => s + d.goldGained, 0);
  const name = new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dismiss = () => markSeen(`season:${month}`);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title="SEASON CLOSED" variant={title ? 'gold' : 'system'} pulse>
          <SysText style={styles.month}>{name.toUpperCase()}</SysText>
          {title ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <SysText variant="caption">Title acquired</SysText>
              <SysText style={styles.title}>[{title}]</SysText>
            </View>
          ) : null}
          <View style={styles.grid}>
            <Stat label="Days kept" value={String(kept)} color={colors.cyan} />
            <Stat label="Longest run" value={String(longestRun(days))} />
            <Stat label="Misses" value={String(misses)} color={colors.dangerSoft} />
            <Stat label="EXP" value={`${xp >= 0 ? '+' : ''}${xp}`} />
            <Stat label="Gold" value={`+${gold}`} color={colors.gold} />
          </View>
          <SysText style={styles.body}>A new Season begins today. Whatever happened last month, the slate is clean.</SysText>
          <SysButton label="BEGIN NEW SEASON" variant={title ? 'gold' : 'primary'} onPress={dismiss} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

function Stat({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ width: '33%', alignItems: 'center', paddingVertical: 6 }}>
      <SysText style={{ fontFamily: fonts.display, fontSize: 22, color }}>{value}</SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {label}
      </SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.94)', justifyContent: 'center', padding: 20 },
  month: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 3, textAlign: 'center', color: colors.text },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.gold, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  body: { textAlign: 'center', fontSize: 14, lineHeight: 21 },
});
