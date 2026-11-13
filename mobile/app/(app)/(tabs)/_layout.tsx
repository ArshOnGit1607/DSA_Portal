import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useAuth } from '@dsa-portal/ui-core';
import { useTheme } from '../../../src/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  const { logout } = useAuth();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
        headerRight: () => (
          <Text accessibilityRole="button" onPress={() => void logout()} style={{ color: c.primary, marginRight: 16, fontSize: 16, padding: 8 }}>
            Log out
          </Text>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Practice' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
    </Tabs>
  );
}
