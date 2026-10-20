import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';

import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

export function ComingSoon({ title, variant = 'system', message }: { title: string; variant?: 'system' | 'epic'; message: string }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SystemWindow title={title} variant={variant}>
        <SysText style={{ textAlign: 'center' }}>{message}</SysText>
      </SystemWindow>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20, justifyContent: 'center' },
});
