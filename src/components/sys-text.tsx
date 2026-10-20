import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'label' | 'body' | 'caption' | 'number';

export function SysText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text style={[styles.base, styles[variant], style]} {...rest} />;
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
