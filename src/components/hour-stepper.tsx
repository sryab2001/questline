import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/theme';

import { SysText } from './sys-text';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

interface Props {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}

/** − 07:00 + picker for an hour of the day. */
export function HourStepper({ label, hint, value, onChange }: Props) {
  const step = (d: number) => onChange((value + d + 24) % 24);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <SysText style={{ fontSize: 14, color: colors.text }}>{label}</SysText>
        <SysText variant="caption">{hint}</SysText>
      </View>
      <Pressable style={styles.btn} onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={`${label} earlier`}>
        <SysText style={styles.btnText}>−</SysText>
      </Pressable>
      <SysText style={styles.hour} accessibilityLabel={`${label} ${hh(value)}`}>
        {hh(value)}
      </SysText>
      <Pressable style={styles.btn} onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={`${label} later`}>
        <SysText style={styles.btnText}>+</SysText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 44, height: 44, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.display, fontSize: 22, color: colors.cyan },
  hour: { fontFamily: fonts.display, fontSize: 20, minWidth: 62, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
