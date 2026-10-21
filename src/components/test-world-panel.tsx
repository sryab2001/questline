import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { switchWorld, useWorld } from '@/db/client';
import { seedTestWorld } from '@/db/test-world';
import { colors, fonts } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

/** Enter, reset or leave the Test World: a pre-filled local profile that never syncs. */
export function TestWorldPanel() {
  const world = useWorld();
  const [busy, setBusy] = useState(false);

  if (world === 'real') {
    const enter = () =>
      Alert.alert(
        'Enter the Test World?',
        'A separate profile on this phone with ~80 days of history: level 15+, Gates, items, achievements, a mastered quest and a Job Change ready to pick.\n\nIt never syncs and never touches your real data or reminders. Switch back any time from Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enter', onPress: () => switchWorld('test') },
        ],
      );
    return (
      <SystemWindow title="TEST WORLD" variant="epic">
        <SysText variant="caption" style={{ lineHeight: 18 }}>
          Try every feature on a pre-filled profile without affecting your progress.
        </SysText>
        <SysButton label="ENTER TEST WORLD" variant="ghost" onPress={enter} />
      </SystemWindow>
    );
  }

  const reset = () =>
    Alert.alert('Reset the Test World?', 'Wipes it and rebuilds the ~80 days of history ending yesterday.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await seedTestWorld();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <SystemWindow title="TEST WORLD" variant="epic" pulse>
      <SysText style={{ textAlign: 'center' }}>You are in the Test World. Sync and reminders are off here.</SysText>
      <SysButton label={busy ? 'REBUILDING…' : 'RESET TEST WORLD'} variant="ghost" disabled={busy} onPress={reset} />
      <SysButton label="RETURN TO MY WORLD" onPress={() => switchWorld('real')} />
    </SystemWindow>
  );
}

/** Thin strip on every tab so the Test World is never mistaken for real progress. */
export function TestWorldBanner() {
  const world = useWorld();
  if (world !== 'test') return null;
  return (
    <SafeAreaView edges={['top']} style={styles.banner}>
      <SysText style={styles.bannerText}>TEST WORLD · NOT SYNCED</SysText>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.epic, paddingBottom: 3, alignItems: 'center' },
  bannerText: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 2.4, color: colors.bg },
});
