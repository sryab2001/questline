import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { setSurvival } from '@/db/actions';
import type { SurvivalEntry } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors } from '@/theme';

import { prettyDay } from './penalty-modal';
import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

/** Shown once when a penalty quest ends, cleared or failed. */
export function SurvivalResultModal({ entry }: { entry: SurvivalEntry }) {
  const cleared = entry.quest.status === 'cleared';

  useEffect(() => {
    playSound(cleared ? 'quest' : 'penalty');
  }, [cleared]);

  const dismiss = () => setSurvival(entry.day, { ...entry.quest, seen: true });

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow variant={cleared ? 'system' : 'danger'} title="PENALTY QUEST" pulse>
          <SysText style={[styles.title, { color: cleared ? colors.cyan : colors.dangerSoft }]}>
            {cleared ? 'SURVIVED' : 'FAILED'}
          </SysText>
          <SysText style={styles.body}>
            {cleared
              ? `You survived. The penalty for ${prettyDay(entry.day)} has been halved.`
              : `Time ran out. The full penalty for ${prettyDay(entry.day)} stands.`}
          </SysText>
          <SysButton label="CONTINUE" variant={cleared ? 'primary' : 'danger'} onPress={dismiss} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.94)', justifyContent: 'center', padding: 20 },
  title: { fontSize: 34, letterSpacing: 4, textAlign: 'center', fontFamily: 'Rajdhani_700Bold' },
  body: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
});
