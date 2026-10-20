import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { updateSettings } from '@/db/actions';
import { colors, fonts } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

interface Props {
  from: number;
  to: number;
  onOpenStatus: () => void;
}

export function LevelUpModal({ from, to, onOpenStatus }: Props) {
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    pulse.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);

  const glow = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.98 + pulse.value * 0.02 }] }));
  const gained = to - from;
  const dismiss = () => updateSettings({ lastSeenLevel: to });

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <SysText variant="label">SYSTEM NOTICE</SysText>
          <Animated.View style={glow}>
            <SysText style={styles.title}>LEVEL UP!</SysText>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ alignSelf: 'stretch' }}>
          <SystemWindow pulse>
            <View style={styles.levels}>
              <View style={{ alignItems: 'center' }}>
                <SysText variant="caption" style={{ letterSpacing: 2 }}>
                  LEVEL
                </SysText>
                <SysText style={[styles.levelNum, { color: colors.textMuted, fontSize: 40 }]}>{from}</SysText>
              </View>
              <SysText style={{ fontFamily: fonts.display, fontSize: 28, color: colors.cyan }}>→</SysText>
              <View style={{ alignItems: 'center' }}>
                <SysText variant="caption" style={{ letterSpacing: 2, color: colors.cyan }}>
                  LEVEL
                </SysText>
                <SysText style={styles.levelNum}>{to}</SysText>
              </View>
            </View>
            <View style={styles.rewards}>
              <Reward label="All stats" value={`+${gained} each`} />
              <Reward label="Rank progress" value={`Lv. ${to}`} />
            </View>
          </SystemWindow>
        </Animated.View>

        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <SysButton
            label="VIEW STATUS"
            onPress={async () => {
              await dismiss();
              onOpenStatus();
            }}
          />
          <SysButton label="CONTINUE" variant="ghost" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
}

function Reward({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <SysText variant="caption" style={{ fontSize: 14 }}>
        {label}
      </SysText>
      <SysText style={{ fontSize: 14, color: colors.cyan, fontFamily: fonts.bodySemi }}>{value}</SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.96)', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 28 },
  title: {
    fontFamily: fonts.display,
    fontSize: 64,
    lineHeight: 68,
    letterSpacing: 3,
    color: colors.text,
    textShadowColor: 'rgba(92,208,255,0.9)',
    textShadowRadius: 24,
  },
  levels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  levelNum: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, textShadowColor: 'rgba(92,208,255,0.8)', textShadowRadius: 18 },
  rewards: { gap: 10, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 14 },
});
