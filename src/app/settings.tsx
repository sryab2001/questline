import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { HourStepper } from '@/components/hour-stepper';
import { ScreenHeader } from '@/components/screen-header';
import { SysButton } from '@/components/sys-button';
import { SoundPanel } from '@/components/sound-panel';
import { SyncPanel } from '@/components/sync-panel';
import { TestWorldPanel } from '@/components/test-world-panel';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { devSimulateMissedDay, deviceTimeZone, updateSettings } from '@/db/actions';
import { useWorld } from '@/db/client';
import { usePlayerState } from '@/hooks/use-player-state';
import { notificationPermission, setupNotifications } from '@/notifications';
import { colors, fonts } from '@/theme';

const URGENT_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'rare', label: 'Rare' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'often', label: 'Often' },
] as const;

export default function SettingsScreen() {
  const player = usePlayerState();
  const world = useWorld();
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

        <SystemWindow title="FEEDBACK">
          <View style={styles.tzRow}>
            <View style={{ flex: 1 }}>
              <SysText style={{ fontSize: 14, color: colors.text }}>Sound effects</SysText>
              <SysText variant="caption">System chimes, level-up and penalty alarms</SysText>
            </View>
            <Switch
              value={s.soundOn}
              onValueChange={(v) => updateSettings({ soundOn: v })}
              trackColor={{ true: colors.borderDone, false: colors.borderMuted }}
              thumbColor={s.soundOn ? colors.cyan : colors.textMuted}
              accessibilityLabel="Sound effects"
            />
          </View>
          <View style={styles.tzRow}>
            <View style={{ flex: 1 }}>
              <SysText style={{ fontSize: 14, color: colors.text }}>Surprise rewards</SysText>
              <SysText variant="caption">Random loot drops and Critical Clears</SysText>
            </View>
            <Switch
              value={s.surprisesOn}
              onValueChange={(v) => updateSettings({ surprisesOn: v })}
              trackColor={{ true: colors.borderDone, false: colors.borderMuted }}
              thumbColor={s.surprisesOn ? colors.cyan : colors.textMuted}
              accessibilityLabel="Surprise rewards"
            />
          </View>
          <View style={{ gap: 8 }}>
            <View>
              <SysText style={{ fontSize: 14, color: colors.text }}>Urgent Quests</SysText>
              <SysText variant="caption">Optional surprise micro-quests between your reminder hours. Never penalised.</SysText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {URGENT_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={s.urgentFrequency === o.value}
                  onPress={() => updateSettings({ urgentFrequency: o.value })}
                  accessibilityLabel={`Urgent Quests: ${o.label}`}
                />
              ))}
            </View>
          </View>
          <SysButton label="HOW THE SYSTEM WORKS" variant="ghost" onPress={() => router.push('/guide')} />
        </SystemWindow>

        <TestWorldPanel />
        {world === 'real' ? <SyncPanel /> : null}

        <SoundPanel />

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
  tzRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
