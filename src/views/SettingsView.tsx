import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { CARD_SURFACE_STYLE } from '../components/cardSurface';

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
  dayStartHour: number;
  dayEndHour: number;
  onChangeValue: (key: SettingsFeatureKey, next: boolean) => void;
  onChangeDayHours: (next: { dayStartHour: number; dayEndHour: number }) => void;
  onSyncBackup: () => Promise<void>;
}

type SettingRow = {
  key: SettingsFeatureKey;
  title: string;
  detail: string;
};

export const API_KEY_STORAGE_KEY = 'mybrain_api_key';
export const API_BASE_URL_STORAGE_KEY = 'mybrain_api_base_url';
export const MODEL_NAME_STORAGE_KEY = 'mybrain_model_name';
export const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL_NAME = 'gpt-4o';

const SETTINGS: SettingRow[] = [
  { key: 'matrixEnabled', title: '矩阵页', detail: '显示 2x2 四象限画布' },
  { key: 'calendarEnabled', title: '日历页', detail: '显示双轴并轨时间盒' },
  { key: 'tasksEnabled', title: '清单页', detail: '显示可滑动任务列表' },
  { key: 'haptics', title: '震动反馈', detail: '完成、搁置等操作时轻触反馈' },
  { key: 'demoSeed', title: '示例数据', detail: '空库时自动注入基础样例任务' },
  { key: 'pinchCollapse', title: '捏合收起', detail: '允许四象限双指缩回基础网格' },
  { key: 'denseLayout', title: '紧凑布局', detail: '缩短部分列表与页面留白' },
];

function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '未设置';
  }

  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 4)}...••••`;
  }

  return `${trimmed.slice(0, 7)}...••••`;
}

function clampHour(value: number) {
  if (Number.isNaN(value)) {
    return 8;
  }

  return Math.min(23, Math.max(0, Math.round(value)));
}

function HourStepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowDetail}>{`${String(value).padStart(2, '0')}:00`}</Text>
      </View>
      <View style={styles.stepperControls}>
        <Pressable accessibilityRole="button" onPress={onDecrease} style={styles.stepperButton}>
          <Text style={styles.stepperText}>-</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{String(value).padStart(2, '0')}</Text>
        <Pressable accessibilityRole="button" onPress={onIncrease} style={styles.stepperButton}>
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SettingsView({
  values,
  dayStartHour,
  dayEndHour,
  onChangeValue,
  onChangeDayHours,
  onSyncBackup,
}: SettingsViewProps) {
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [modelName, setModelName] = useState(DEFAULT_MODEL_NAME);
  const [showKey, setShowKey] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  useEffect(() => {
    let alive = true;

    const loadSecureSettings = async () => {
      try {
        const [storedKey, storedBaseUrl, storedModel] = await Promise.all([
          SecureStore.getItemAsync(API_KEY_STORAGE_KEY),
          SecureStore.getItemAsync(API_BASE_URL_STORAGE_KEY),
          SecureStore.getItemAsync(MODEL_NAME_STORAGE_KEY),
        ]);

        if (!alive) {
          return;
        }

        setApiKey(storedKey ?? '');
        setApiBaseUrl(storedBaseUrl ?? DEFAULT_API_BASE_URL);
        setModelName(storedModel ?? DEFAULT_MODEL_NAME);
      } catch {
        if (alive) {
          setSaveState('error');
        }
      }
    };

    void loadSecureSettings();

    return () => {
      alive = false;
    };
  }, []);

  const masked = useMemo(() => maskApiKey(apiKey), [apiKey]);

  const updateDayStart = (nextValue: number) => {
    const nextStart = Math.min(clampHour(nextValue), dayEndHour - 1);
    onChangeDayHours({ dayStartHour: nextStart, dayEndHour });
  };

  const updateDayEnd = (nextValue: number) => {
    const nextEnd = Math.max(clampHour(nextValue), dayStartHour + 1);
    onChangeDayHours({ dayStartHour, dayEndHour: nextEnd });
  };

  const saveSecureSettings = async () => {
    setSaveState('saving');
    try {
      await Promise.all([
        SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey.trim()),
        SecureStore.setItemAsync(API_BASE_URL_STORAGE_KEY, apiBaseUrl.trim() || DEFAULT_API_BASE_URL),
        SecureStore.setItemAsync(MODEL_NAME_STORAGE_KEY, modelName.trim() || DEFAULT_MODEL_NAME),
      ]);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const runSyncBackup = async () => {
    setSyncState('syncing');
    try {
      await onSyncBackup();
      setSyncState('synced');
    } catch {
      setSyncState('error');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>设置</Text>
        <Text style={styles.title}>隐私、模型与作息</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>功能电闸</Text>
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
          <Text style={styles.panelTitle}>模型连接</Text>
          <Text style={styles.panelDetail}>
            密钥、接口网址与模型名会同步保存到 SecureStore。你可以切换中转网关，也可以输入 deepseek-chat 等兼容模型。
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>API Key</Text>
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
                <Text style={styles.keyButtonText}>{showKey ? '隐藏' : '显示'}</Text>
              </Pressable>
            </View>
            <Text style={styles.maskText}>{masked}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>接口网址</Text>
            <TextInput
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={DEFAULT_API_BASE_URL}
              placeholderTextColor="#8E8E93"
              style={styles.fullInput}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>模型名称</Text>
            <TextInput
              value={modelName}
              onChangeText={setModelName}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={DEFAULT_MODEL_NAME}
              placeholderTextColor="#8E8E93"
              style={styles.fullInput}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={saveState === 'saving'}
            onPress={saveSecureSettings}
            style={[styles.saveButton, saveState === 'saving' && styles.disabledButton]}
          >
            <Text style={styles.saveButtonText}>
              {saveState === 'saving' ? '正在保存' : saveState === 'saved' ? '已安全保存' : '保存模型配置'}
            </Text>
          </Pressable>
          {saveState === 'error' ? <Text style={styles.errorText}>保存失败，请检查设备 SecureStore 状态。</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>每日作息</Text>
          <Text style={styles.panelDetail}>日历时间轴会按你的作息节点动态生成，从开始时间到结束时间逐小时渲染。</Text>

          <HourStepper
            label="一天开始"
            value={dayStartHour}
            onDecrease={() => updateDayStart(dayStartHour - 1)}
            onIncrease={() => updateDayStart(dayStartHour + 1)}
          />
          <HourStepper
            label="一天结束"
            value={dayEndHour}
            onDecrease={() => updateDayEnd(dayEndHour - 1)}
            onIncrease={() => updateDayEnd(dayEndHour + 1)}
          />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>同步备份</Text>
          <Text style={styles.panelDetail}>点击前会先阻塞执行 WAL checkpoint，把 .db-wal 合并回主库，避免单文件备份损坏。</Text>
          <Pressable
            accessibilityRole="button"
            disabled={syncState === 'syncing'}
            onPress={runSyncBackup}
            style={[styles.syncButton, syncState === 'syncing' && styles.disabledButton]}
          >
            <Text style={styles.syncButtonText}>
              {syncState === 'syncing' ? '正在合并 WAL' : syncState === 'synced' ? '已完成合并' : '同步备份'}
            </Text>
          </Pressable>
          {syncState === 'error' ? <Text style={styles.errorText}>WAL 合并失败，请稍后重试。</Text> : null}
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
    ...CARD_SURFACE_STYLE,
    padding: 14,
    gap: 10,
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
  fieldGroup: {
    gap: 7,
  },
  fieldLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '800',
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
  fullInput: {
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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F6',
    paddingTop: 10,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#ECECEE',
    overflow: 'hidden',
  },
  stepperButton: {
    width: 38,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    color: '#007AFF',
    fontSize: 20,
    fontWeight: '800',
  },
  stepperValue: {
    minWidth: 38,
    textAlign: 'center',
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
  disabledButton: {
    opacity: 0.48,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    lineHeight: 17,
  },
});
