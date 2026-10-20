import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors, fonts } from '@/theme';

type IconProps = ComponentProps<typeof MaterialCommunityIcons>;

function TabIcon({ name, color, size }: { name: IconProps['name']; color: ColorValue; size: number }) {
  return <MaterialCommunityIcons name={name} color={(color ?? undefined) as IconProps['color']} size={size} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.borderMuted },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.displaySemi, fontSize: 12, letterSpacing: 1.2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'QUESTS', tabBarIcon: (p) => <TabIcon name="checkbox-marked-outline" {...p} /> }}
      />
      <Tabs.Screen name="status" options={{ title: 'STATUS', tabBarIcon: (p) => <TabIcon name="account-outline" {...p} /> }} />
      <Tabs.Screen name="store" options={{ title: 'STORE', tabBarIcon: (p) => <TabIcon name="shopping-outline" {...p} /> }} />
      <Tabs.Screen name="class" options={{ title: 'CLASS', tabBarIcon: (p) => <TabIcon name="flag-variant-outline" {...p} /> }} />
    </Tabs>
  );
}
