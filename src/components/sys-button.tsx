import { Pressable, type PressableProps, StyleSheet, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

type Variant = 'primary' | 'ghost' | 'danger' | 'gold';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  style?: ViewStyle;
}

const look: Record<Variant, { bg: string; border: string; text: string; glow?: string }> = {
  primary: { bg: colors.cyan, border: colors.cyan, text: colors.bg, glow: '0 0 20px rgba(92,208,255,0.55)' },
  ghost: { bg: 'transparent', border: colors.borderMuted, text: colors.textMuted },
  danger: { bg: colors.danger, border: colors.danger, text: '#12040a', glow: '0 0 22px rgba(255,77,94,0.5)' },
  gold: { bg: colors.gold, border: colors.gold, text: colors.goldPanel, glow: '0 0 20px rgba(255,200,87,0.45)' },
};

export function SysButton({ label, variant = 'primary', style, disabled, ...rest }: Props) {
  const l = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: l.bg, borderColor: l.border, boxShadow: l.glow, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
      {...rest}>
      <SysText style={[styles.label, { color: l.text }]}>{label}</SysText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  label: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 3 },
});
