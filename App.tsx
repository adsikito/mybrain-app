import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { initializeMyBrainDatabase } from './database';

export default function App() {
  const [status, setStatus] = useState<'booting' | 'ready' | 'error'>('booting');

  useEffect(() => {
    let alive = true;

    initializeMyBrainDatabase()
      .then(() => {
        if (alive) {
          setStatus('ready');
        }
      })
      .catch(() => {
        if (alive) {
          setStatus('error');
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.panel}>
            <Text style={styles.label}>MyBrain AI</Text>
            <Text style={styles.title}>Sprint 1 foundation is live.</Text>
            <Text style={styles.body}>
              {status === 'booting'
                ? 'Bootstrapping the local SQLite core.'
                : status === 'ready'
                  ? 'SQLite, Expo, and native bridge layers are ready.'
                  : 'Database bootstrap failed.'}
            </Text>
            <View style={styles.row}>
              {status === 'booting' ? <ActivityIndicator /> : null}
              <Text style={styles.meta}>{status}</Text>
            </View>
          </View>
          <StatusBar style="auto" />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  panel: {
    gap: 12,
  },
  label: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },
  body: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meta: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
