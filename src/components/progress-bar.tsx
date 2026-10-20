import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

interface Props {
  /** 0..1 */
  value: number;
  color?: string;
  height?: number;
  glow?: boolean;
}

export function ProgressBar({ value, color = colors.cyan, height = 6, glow = true }: Props) {
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { height }]}>
      <View style={{ height: '100%', width: pct, backgroundColor: color, boxShadow: glow ? `0 0 10px ${color}` : undefined }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.track, borderWidth: 1, borderColor: colors.borderMuted, overflow: 'hidden' },
});
