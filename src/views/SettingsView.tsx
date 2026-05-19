import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { TaskTransactionPlan } from '../../database';

export type SettingsFeatureKey =
  | 'matrixEnabled'
  | 'calendarEnabled'
  | 'tasksEnabled'
  | 'haptics'
  | 'demoSeed'
  | 'pinchCollapse'
  | 'denseLayout';

export type SettingsState = Record<SettingsFeatureKey, boolean>;

export interface SettingsViewProps {
  values: SettingsState;
  onChangeValue: (key: SettingsFeatureKey, next: boolean) => void;
  onSyncBackup: () => Promise<void>;
}

type SettingRow = {
  key: SettingsFeatureKey;
  title: string;
  detail: string;
};

const SETTINGS: SettingRow[] = [
  { key: 'matrixEnabled', title: '\u77e9\u9635\u9875', detail: '\u663e\u793a 2x2 \u56db\u8c61\u9650' },
  { key: 'calendarEnabled', title: '\u65e5\u5386\u9875', detail: '\u663e\u793a\u53cc\u8f74\u5e76\u8f68\u6392\u7a0b' },
  { key: 'tasksEnabled', title: '\u6e05\u5355\u9875', detail: '\u663e\u793a\u53ef\u6ed1\u52a8\u4efb\u52a1\u5217\u8868' },
  { key: 'haptics', title: '\u9707\u52a8\u53cd\u9988', detail: '\u64cd\u4f5c\u65f6\u5f00\u542f\u8f7b\u5fae\u9707\u52a8' },
  { key: 'demoSeed', title: '\u793a\u4f8b\u6570\u636e', detail: '\u9996\u6b21\u542f\u52a8\u81ea\u52a8\u5851\u6837' },
  { key: 'pinchCollapse', title: '\u6350\u5361\u6536\u8d77', detail: '\u5141\u8bb8\u56db\u8c61\u9650\u53cc\u6307\u7f29\u653e' },
  { key: 'denseLayout', title: '\u7d27\u51d1\u7a0b\u5ea6', detail: '\u4f7f\u7528\u66f4\u7d27\u51d1\u7684\u95f4\u8ddd' },
];

const API_KEY_STORAGE_KEY = 'mybrain_api_key';

function maskApiKey(value: string) {
  if (!value) {
    return '\u672a\u8bbe\u7f6e';
  }
  if (value.length <= 8) {
    return `${value.slice(0, 3)}...`;
  }
  return `${value.slice(0, 7)}...\u2022\u2022\u2022\u2022`;
}

export function SettingsView({ values, onChangeValue, onSyncBackup }: SettingsViewProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const masked = useMemo(() => maskApiKey(apiKey), [apiKey]);

  const saveApiKey = async () => {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{'\u8bbe\u7f6e'}</Text>
        <Text style={styles.title}>{'\u9690\u79c1\u4e0e\u7cfb\u7edf\u7535\u95f8'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{'\u529f\u80fd\u7535\u95f8'}</Text>
          {SETTINGS.map((setting) => (
            <View key={setting.key} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{setting.title}</Text>
                <Text style={styles.rowDetail}>{setting.detail}</Text>
              </View>
              <Switch
                value={values[setting.key]}
                onValueChange={(next) => onChangeValue(setting.key, next)}
                trackColor={{ false: '#D1D1D6', true: '#007AFF' }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{'\u5bc6\u94a5\u4fdd\u5b58'}</Text>
          <Text style={styles.panelDetail}>{'\u5b58\u50a8\u5728\u672c\u5730 SecureStore\uff0c\u5e73\u53f0\u4f18\u5148\u8d70 Keystore \u7ebf\u8def\u3002'}</Text>
          <View style={styles.keyRow}>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="sk-proj..."
              placeholderTextColor="#8E8E93"
              style={styles.keyInput}
            />
            <Pressable accessibilityRole="button" onPress={() => setShowKey((value) => !value)} style={styles.keyButton}>
              <Text style={styles.keyButtonText}>{showKey ? '\u9690\u85cf' : '\u663e\u793a'}</Text>
            </Pressable>
          </View>
          <Text style={styles.maskText}>{masked}</Text>
          <Pressable accessibilityRole="button" onPress={saveApiKey} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>{'\u4fdd\u5b58\u5bc6\u94a5'}</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{'\u540c\u6b65\u5907\u4efd'}</Text>
          <Text style={styles.panelDetail}>{'\u5728\u5907\u4efd\u524d\u5148\u6267\u884c WAL checkpoint\uff0c\u518d\u8fdb\u884c WebDAV \u6216\u672c\u5730\u5907\u4efd\u3002'}</Text>
          <Pressable accessibilityRole="button" onPress={onSyncBackup} style={styles.syncButton}>
            <Text style={styles.syncButtonText}>{'\u540c\u6b65\u5907\u4efd'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9FB',
    paddingTop: 12,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 4,
  },
  kicker: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: '#1C1C1E',
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  panel: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    padding: 14,
    gap: 10,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 1,
  },
  panelTitle: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '800',
  },
  panelDetail: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F6',
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '800',
  },
  rowDetail: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 17,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  keyInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#ECECEE',
    color: '#1C1C1E',
    paddingHorizontal: 14,
    fontSize: 15,
  },
  keyButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 14,
  },
  keyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  maskText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  saveButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: '#ECECEE',
  },
  saveButtonText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '800',
  },
  syncButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
