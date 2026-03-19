import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/authStore';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { WalletConnectProvider } from '../src/contexts/WalletConnectContext';

export default function RootLayout() {
  const { isLoading, loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <LanguageProvider>
      <WalletConnectProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0f0f23' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="bet/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="onchain-bet/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="group/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="create-bet" options={{ presentation: 'modal' }} />
        </Stack>
      </WalletConnectProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
  },
});
