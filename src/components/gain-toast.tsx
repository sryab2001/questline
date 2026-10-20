import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { DAILY_CLEAR_BONUS_XP, GOLD_DAILY_CLEAR, POINTS_PER_DAILY_CLEAR } from '@/engine';
import type { ClearEvent } from '@/hooks/use-clear-events';
import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

/** Floating "+EXP +G" notice that rises and fades after a goal is cleared. */
export function GainToast({ event }: { event: ClearEvent | null }) {
  const [hiddenKey, setHiddenKey] = useState<number | null>(null);

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setHiddenKey(event.key), event.questComplete ? 2600 : 1600);
    return () => clearTimeout(t);
  }, [event]);

  const shown = event && event.key !== hiddenKey ? event : null;
  if (!shown) return null;
  return (
    <Animated.View
      key={shown.key}
      entering={FadeInDown.duration(260)}
      exiting={FadeOutUp.duration(400)}
      pointerEvents="none"
      style={styles.toast}
      accessibilityLiveRegion="polite">
      <SysText style={styles.title}>{shown.questComplete ? 'DAILY QUEST COMPLETE' : `${shown.name.toUpperCase()} CLEARED`}</SysText>
      <SysText style={styles.gains}>
        +{shown.xp + (shown.questComplete ? DAILY_CLEAR_BONUS_XP : 0)} EXP · +{shown.gold + (shown.questComplete ? GOLD_DAILY_CLEAR : 0)} G
        {shown.questComplete ? ` · +${POINTS_PER_DAILY_CLEAR} AP` : ''}
      </SysText>
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
    gap: 2,
    zIndex: 10,
  },
  title: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 2.4, color: colors.cyan },
  gains: { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
});
