import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type AppTab = 'matrix' | 'tasks' | 'calendar' | 'chat' | 'settings';

type TabItem = {
  key: AppTab;
  label: string;
};

const TABS: TabItem[] = [
  { key: 'matrix', label: '\u77e9\u9635' },
  { key: 'tasks', label: '\u6e05\u5355' },
  { key: 'calendar', label: '\u65e5\u5386' },
  { key: 'chat', label: '\u52a9\u7406' },
  { key: 'settings', label: '\u8bbe\u7f6e' },
];

export interface BottomTabBarProps {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  tabs?: AppTab[];
}

export function BottomTabBar({ activeTab, onChangeTab, tabs = TABS.map((tab) => tab.key) }: BottomTabBarProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.container}>
        {TABS.filter((tab) => tabs.includes(tab.key)).map((tab) => {
          const active = tab.key === activeTab;

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChangeTab(tab.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: 'rgba(249, 249, 251, 0.92)',
  },
  container: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderWidth: 1,
    borderColor: '#ECECEE',
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#F4F4F6',
  },
  label: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  labelActive: {
    color: '#1C1C1E',
    fontWeight: '800',
  },
});
