import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DsaProvider } from '@dsa-portal/ui-core';
import { dsa } from '../src/dsa';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const { c, mode } = useTheme();
  useEffect(() => {
    void dsa.stores.auth.getState().restore(); // silent sign-in with the stored refresh token
  }, []);
  return (
    <SafeAreaProvider>
      <DsaProvider value={dsa}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.surface },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="login" options={{ title: 'Sign in' }} />
          <Stack.Screen name="register" options={{ title: 'Create account' }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </DsaProvider>
    </SafeAreaProvider>
  );
}
