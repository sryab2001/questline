import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/theme';

interface Props {
  /** 0..1 */
  value: number;
  color?: string;
  height?: number;
  glow?: boolean;
}

/** A System-style bar that eases to its new value. */
export function ProgressBar({ value, color = colors.cyan, height = 6, glow = true }: Props) {
  const target = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(target);

  useEffect(() => {
    progress.value = withTiming(target, { duration: 550, easing: Easing.out(Easing.cubic) });
  }, [target, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={[styles.track, { height }]}>
      <Animated.View style={[{ height: '100%', backgroundColor: color, boxShadow: glow ? `0 0 10px ${color}` : undefined }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.track, borderWidth: 1, borderColor: colors.borderMuted, overflow: 'hidden' },
});
