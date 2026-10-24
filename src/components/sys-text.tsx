import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'label' | 'body' | 'caption' | 'number';

export function SysText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  // The body variant has a 21pt line height; a bigger font set in `style` without its
  // own lineHeight would be clipped (top and bottom cut off), so scale it to fit.
  const own = StyleSheet.flatten(style);
  const fit = own?.fontSize && own.lineHeight === undefined && variant === 'body' ? { lineHeight: Math.round(own.fontSize * 1.4) } : null;
  return <Text style={[styles.base, styles[variant], style, fit]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text },
  display: { fontFamily: fonts.display, fontSize: 56, lineHeight: 58, textShadowColor: 'rgba(92,208,255,0.7)', textShadowRadius: 16 },
  title: { fontFamily: fonts.display, fontSize: 21, letterSpacing: 0.8 },
  label: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 2.8, color: colors.textMuted },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textSoft },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  number: { fontFamily: fonts.display, fontSize: 21, fontVariant: ['tabular-nums'] },
});
