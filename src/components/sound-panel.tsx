import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  chooseCustomSound,
  clearCustomSound,
  previewEvent,
  readSoundPack,
  setVoiceEnabled,
  SOUND_EVENTS,
  type SoundEvent,
  voiceEnabled,
} from '@/sound';
import { colors } from '@/theme';

import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

/** The Voice of the World switch and your own sounds per moment. Stored on this phone only. */
export function SoundPanel() {
  const [voice, setVoice] = useState(voiceEnabled);
  const [pack, setPack] = useState(readSoundPack);
  const [open, setOpen] = useState(false);

  const choose = async (event: SoundEvent) => {
    try {
      if (await chooseCustomSound(event)) {
        setPack(readSoundPack());
        previewEvent(event);
      }
    } catch (e) {
      Alert.alert('Could not use that file', e instanceof Error ? e.message : String(e));
    }
  };
  const reset = (event: SoundEvent) => {
    clearCustomSound(event);
    setPack(readSoundPack());
  };

  const custom = Object.keys(pack).length;
  return (
    <SystemWindow title="VOICE & SOUNDS" variant="epic">
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <SysText style={{ fontSize: 14, color: colors.text }}>Voice of the World</SysText>
          <SysText variant="caption">The System announces level-ups, titles, Bosses and more</SysText>
        </View>
        <Switch
          value={voice}
          onValueChange={(v) => {
            setVoiceEnabled(v);
            setVoice(v);
            if (v) previewEvent('level_up');
          }}
          trackColor={{ true: colors.borderDone, false: colors.borderMuted }}
          thumbColor={voice ? colors.epic : colors.textMuted}
          accessibilityLabel="Voice of the World"
        />
      </View>

      <Pressable onPress={() => setOpen((o) => !o)} style={styles.row} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <SysText style={{ fontSize: 14, color: colors.text }}>Your own sounds</SysText>
          <SysText variant="caption">{custom ? `${custom} moment${custom === 1 ? '' : 's'} use your files` : 'Pick an audio file from your phone for any moment'}</SysText>
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
      </Pressable>

      {open
        ? (Object.keys(SOUND_EVENTS) as SoundEvent[]).map((event) => {
            const mine = !!pack[event];
            return (
              <View key={event} style={styles.event}>
                <View style={{ flex: 1 }}>
                  <SysText style={{ fontSize: 13, color: colors.text }}>{SOUND_EVENTS[event].label}</SysText>
                  <SysText variant="caption" style={{ fontSize: 11, color: mine ? colors.epic : colors.textMuted }}>
                    {mine ? 'Your file' : 'Default'}
                  </SysText>
                </View>
                <IconButton icon="play" label={`Preview ${SOUND_EVENTS[event].label}`} onPress={() => previewEvent(event)} />
                <IconButton icon="folder-music-outline" label={`Choose a file for ${SOUND_EVENTS[event].label}`} onPress={() => choose(event)} />
                {mine ? <IconButton icon="backup-restore" label={`Reset ${SOUND_EVENTS[event].label}`} onPress={() => reset(event)} /> : null}
              </View>
            );
          })
        : null}
      {open ? (
        <SysText variant="caption" style={{ fontSize: 11, lineHeight: 16 }}>
          Files are copied into Questline on this phone and never uploaded or synced.
        </SysText>
      ) : null}
    </SystemWindow>
  );
}

function IconButton({ icon, label, onPress }: { icon: 'play' | 'folder-music-outline' | 'backup-restore'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.icon} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.cyan} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.borderMuted },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
