import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, ZoomIn } from 'react-native-reanimated';

import { DAILY_CLEAR_BONUS_XP, describeDrop, GOLD_DAILY_CLEAR, POINTS_PER_DAILY_CLEAR, type Rarity } from '@/engine';
import type { ClearEvent } from '@/hooks/use-clear-events';
import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

export const RARITY_COLOR: Record<Rarity, string> = {
  Normal: '#e8e8ee',
  Rare: '#7cc4ff',
  Epic: colors.epic,
  Unique: colors.gold,
  Legendary: '#ff9b57',
};

/** Floating notice that rises and fades after a goal is cleared: EXP, gold, and any surprise. */
export function GainToast({ event }: { event: ClearEvent | null }) {
  const [hiddenKey, setHiddenKey] = useState<number | null>(null);

  useEffect(() => {
    if (!event) return;
    const long = event.questComplete || event.drops.length > 0 || event.critical;
    const t = setTimeout(() => setHiddenKey(event.key), long ? 3200 : 1600);
    return () => clearTimeout(t);
  }, [event]);

  const shown = event && event.key !== hiddenKey ? event : null;
  if (!shown) return null;
  const xp = shown.xp + (shown.questComplete ? DAILY_CLEAR_BONUS_XP : 0);
  const gold = shown.gold + (shown.questComplete ? GOLD_DAILY_CLEAR : 0);
  return (
    <Animated.View
      key={shown.key}
      entering={FadeInDown.duration(260)}
      exiting={FadeOutUp.duration(400)}
      pointerEvents="none"
      style={styles.toast}
      accessibilityLiveRegion="polite">
      <SysText style={styles.title}>{shown.questComplete ? 'DAILY QUEST COMPLETE' : `${shown.name.toUpperCase()} CLEARED`}</SysText>
      {shown.critical ? (
        <Animated.View entering={ZoomIn.duration(300).delay(150)}>
          <SysText style={styles.critical}>CRITICAL CLEAR ×2</SysText>
        </Animated.View>
      ) : null}
      <SysText style={styles.gains}>
        +{xp} EXP · +{gold} G{shown.questComplete ? ` · +${POINTS_PER_DAILY_CLEAR} AP` : ''}
      </SysText>
      {shown.comeback ? <SysText style={styles.comeback}>[Recovered] comeback bonus</SysText> : null}
      {shown.drops.map((d, i) => (
        <Animated.View key={i} entering={ZoomIn.duration(300).delay(350 + i * 150)}>
          <SysText style={[styles.drop, { color: RARITY_COLOR[d.rarity] }]}>
            [{d.rarity}] {describeDrop(d)}
          </SysText>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0 0 22px rgba(63,184,255,0.55)',
    alignItems: 'center',
    gap: 3,
    zIndex: 10,
    maxWidth: '90%',
  },
  title: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 2.4, color: colors.cyan, textAlign: 'center' },
  critical: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 2, color: colors.gold, textShadowColor: 'rgba(255,200,87,0.7)', textShadowRadius: 10 },
  gains: { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  comeback: { fontSize: 12, color: colors.gold },
  drop: { fontFamily: fonts.displaySemi, fontSize: 15, textAlign: 'center' },
});
