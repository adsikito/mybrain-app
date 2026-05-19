import React, { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import type { TaskRecord, TaskStatus } from '../../database';
import { SwipeableTaskRow } from '../components/SwipeableTaskRow';

export interface TasksViewProps {
  tasks: TaskRecord[];
  onComplete: (id: string) => void;
  onFreeze: (id: string) => void;
  onFocus: (task: TaskRecord) => void;
  onTriggerAI: (task: TaskRecord) => void;
  hapticsEnabled?: boolean;
}

const STATUS_ORDER: TaskStatus[] = ['pending', 'frozen', 'completed'];

function getStatusTitle(status: TaskStatus) {
  switch (status) {
    case 'pending':
      return '\u5f85\u5904\u7406';
    case 'frozen':
      return '\u5df2\u6401\u7f6e';
    case 'completed':
      return '\u5df2\u5b8c\u6210';
  }
}

export function TasksView({
  tasks,
  onComplete,
  onFreeze,
  onFocus,
  onTriggerAI,
  hapticsEnabled = true,
}: TasksViewProps) {
  const sections = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        title: getStatusTitle(status),
        data: tasks.filter((task) => task.status === status),
      })).filter((section) => section.data.length > 0),
    [tasks],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{'\u6e05\u5355'}</Text>
        <Text style={styles.title}>{'\u628a\u4efb\u52a1\u653e\u8fdb\u53ef\u6267\u884c\u7684\u961f\u5217'}</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SwipeableTaskRow
            task={item}
            onComplete={onComplete}
            onFreeze={onFreeze}
            onFocus={onFocus}
            onTriggerAI={onTriggerAI}
            enableHaptics={hapticsEnabled}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{'\u6e05\u5355\u662f\u7a7a\u7684'}</Text>
            <Text style={styles.emptyBody}>{'\u53ef\u4ee5\u5728\u52a9\u7406\u91cc\u8f93\u5165\u201c\u62c6\u89e3\u201d\u6765\u751f\u6210\u672c\u5730\u4efb\u52a1\u3002'}</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionCount: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyBody: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 19,
  },
});
