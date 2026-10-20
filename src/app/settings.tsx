import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SyncPanel } from '@/components/sync-panel';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { devSimulateMissedDay, deviceTimeZone, updateSettings } from '@/db/actions';
import { usePlayerState } from '@/hooks/use-player-state';
import { notificationPermission, setupNotifications } from '@/notifications';
import { colors, fonts } from '@/theme';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function SettingsScreen() {
  const player = usePlayerState();
  const [name, setName] = useState(player?.settings.playerName ?? '');
  const [notifOk, setNotifOk] = useState<boolean | null>(null);

  useEffect(() => {
    notificationPermission().then(setNotifOk);
  }, []);

  if (!player) return null;
  const s = player.settings;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="SETTINGS" />

        <SystemWindow title="PLAYER">
          <SysText variant="label" style={{ fontSize: 13 }}>
            NAME
          </SysText>
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={() => name.trim() && updateSettings({ playerName: name.trim() })}
            style={styles.input}
            accessibilityLabel="Player name"
          />
        </SystemWindow>

        <SystemWindow title="TIME">
          <HourStepper
            label="Daily reset"
            hint="When a new Daily Quest begins"
            value={s.resetHour}
            onChange={(v) => updateSettings({ resetHour: v })}
          />
          <HourStepper
            label="Quest arrival"
            hint="Morning notification"
            value={s.morningHour}
            onChange={(v) => updateSettings({ morningHour: v })}
          />
          <HourStepper
            label="Penalty warning"
            hint="If goals remain"
            value={s.warningHour}
            onChange={(v) => updateSettings({ warningHour: v })}
          />
          <View style={styles.tzRow}>
            <View style={{ flex: 1 }}>
              <SysText style={{ fontSize: 14, color: colors.text }}>Time zone</SysText>
              <SysText variant="caption">{s.timeZone}</SysText>
            </View>
            {s.timeZone !== deviceTimeZone() ? (
              <SysButton label="USE PHONE'S" variant="ghost" onPress={() => updateSettings({ timeZone: deviceTimeZone() })} />
            ) : null}
          </View>
        </SystemWindow>

        <SyncPanel />

        <SystemWindow title="NOTIFICATIONS">
          <SysText>
            {notifOk === null ? 'Checking…' : notifOk ? 'System messages are enabled.' : 'System messages are blocked.'}
          </SysText>
          {notifOk === false ? (
            <SysButton
              label="ENABLE"
              onPress={async () => {
                const ok = await setupNotifications();
                setNotifOk(ok);
                if (!ok) Linking.openSettings();
              }}
            />
          ) : null}
        </SystemWindow>

        {__DEV__ ? (
          <SystemWindow title="DEV TOOLS" variant="danger">
            <SysText variant="caption">Only visible in development builds.</SysText>
            <SysButton label="SIMULATE A MISSED DAY" variant="danger" onPress={() => devSimulateMissedDay()} />
          </SystemWindow>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function HourStepper({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  const step = (d: number) => onChange((value + d + 24) % 24);
  return (
    <View style={styles.stepRow}>
      <View style={{ flex: 1 }}>
        <SysText style={{ fontSize: 14, color: colors.text }}>{label}</SysText>
        <SysText variant="caption">{hint}</SysText>
      </View>
      <Pressable style={styles.stepBtn} onPress={() => step(-1)} accessibilityLabel={`${label} earlier`}>
        <SysText style={styles.stepBtnText}>−</SysText>
      </Pressable>
      <SysText style={styles.hour}>{hh(value)}</SysText>
      <Pressable style={styles.stepBtn} onPress={() => step(1)} accessibilityLabel={`${label} later`}>
        <SysText style={styles.stepBtnText}>+</SysText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 22 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 44, height: 44, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: fonts.display, fontSize: 22, color: colors.cyan },
  hour: { fontFamily: fonts.display, fontSize: 20, minWidth: 62, textAlign: 'center', fontVariant: ['tabular-nums'] },
  tzRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
