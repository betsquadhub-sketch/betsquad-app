import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/authStore';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { WalletConnectProvider } from '../src/contexts/WalletConnectContext';

export default function RootLayout() {
  const { isLoading, loadUser } = useAuthStore();
  const [appReady, setAppReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('[App] Starting initialization...');
        await loadUser();
        console.log('[App] User loaded, app ready');
        setAppReady(true);
      } catch (err: any) {
        console.error('[App] Init error:', err);
        setError(err?.message || 'Errore di avvio');
        setAppReady(true); // Show app anyway
      }
    };
    
    // Add timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('[App] Init timeout, forcing ready');
      setAppReady(true);
    }, 5000);
    
    init().finally(() => clearTimeout(timeout));
  }, []);

  if (!appReady || isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Errore: {error}</Text>
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
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
});
