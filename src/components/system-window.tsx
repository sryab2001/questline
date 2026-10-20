import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { fonts, windowPalette, type WindowVariant } from '@/theme';

import { SysText } from './sys-text';

interface Props {
  variant?: WindowVariant;
  /** Text for the boxed header pill, e.g. "QUEST INFO". */
  title?: string;
  icon?: ReactNode;
  /** Pulse the glow, like a fresh System notification. */
  pulse?: boolean;
  style?: ViewStyle;
  children: ReactNode;
}

const BRACKET = 16;

export function SystemWindow({ variant = 'system', title, icon, pulse = false, style, children }: Props) {
  const p = windowPalette[variant];
  const glow = useSharedValue(0.55);

  useEffect(() => {
    if (!pulse) return;
    glow.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse, glow]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { boxShadow: `0 0 26px rgba(${p.glow},0.55), inset 0 0 30px rgba(${p.glow},0.16)` },
          glowStyle,
        ]}
      />
      <View style={[styles.panel, { backgroundColor: p.panel, borderColor: p.border }]}>
        {title ? (
          <View style={[styles.pill, { borderColor: p.border }]}>
            {icon}
            <SysText style={[styles.pillText, { color: variant === 'system' ? undefined : p.accent }]}>{title}</SysText>
          </View>
        ) : null}
        {children}
      </View>
      <View pointerEvents="none" style={[styles.bracket, styles.tl, { borderColor: p.bracket }]} />
      <View pointerEvents="none" style={[styles.bracket, styles.tr, { borderColor: p.bracket }]} />
      <View pointerEvents="none" style={[styles.bracket, styles.bl, { borderColor: p.bracket }]} />
      <View pointerEvents="none" style={[styles.bracket, styles.br, { borderColor: p.bracket }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  panel: { borderWidth: 1, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, gap: 14 },
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  pillText: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 3.4 },
  bracket: { position: 'absolute', width: BRACKET, height: BRACKET },
  tl: { top: -4, left: -4, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -4, right: -4, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -4, left: -4, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -4, right: -4, borderBottomWidth: 2, borderRightWidth: 2 },
});
