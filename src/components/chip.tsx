import { Pressable, StyleSheet } from 'react-native';

import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, accent = colors.cyan, accessibilityLabel }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
      style={[
        styles.chip,
        selected ? { borderColor: accent, backgroundColor: colors.panelRowDone } : { borderColor: colors.borderMuted },
      ]}>
      <SysText style={[styles.text, { color: selected ? accent : colors.textMuted }]}>{label}</SysText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 40, minWidth: 40, paddingHorizontal: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.2 },
});
