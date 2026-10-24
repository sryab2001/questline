import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SysText } from '@/components/sys-text';
import { ensureEconomyV2, ensureSettings } from '@/db/actions';
import { db, useWorld } from '@/db/client';
import { seedTestWorldIfEmpty } from '@/db/test-world';
import { PlayerProvider } from '@/hooks/use-player-state';
import { colors } from '@/theme';

import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Switching between the real and Test World remounts everything on the other database.
  const world = useWorld();
  return <WorldRoot key={world} />;
}

function WorldRoot() {
  const [fontsLoaded, fontError] = useFonts({
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (migrated) ensureSettings().then(seedTestWorldIfEmpty).then(ensureEconomyV2).then(() => setSeeded(true));
  }, [migrated]);

  const ready = (fontsLoaded || fontError) && seeded;
  useEffect(() => {
    if (ready || migrationError) SplashScreen.hideAsync();
  }, [ready, migrationError]);

  if (migrationError) {
    return (
      <View style={styles.center}>
        <SysText variant="label" style={{ color: colors.dangerSoft }}>
          DATABASE ERROR
        </SysText>
        <SysText variant="caption">{migrationError.message}</SysText>
      </View>
    );
  }
  if (!ready) return null;

  return (
    <PlayerProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="habits" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="history" />
        <Stack.Screen name="guide" />
        <Stack.Screen name="achievements" />
        <Stack.Screen name="main-quest/[id]" />
        <Stack.Screen name="record" />
        <Stack.Screen name="quest-board" />
        <Stack.Screen name="dungeon" options={{ gestureEnabled: false }} />
        <Stack.Screen name="routines" />
        <Stack.Screen name="routine/[id]" />
        <Stack.Screen name="awakening" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
});
