import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { TaskRecord } from '../../database';

export interface CalendarViewProps {
  tasks: TaskRecord[];
  onScheduleTask: (taskId: string, startAt: number, endAt: number) => void;
}

type CalendarEvent = {
  id: string;
  title: string;
  startHour: number;
  endHour: number;
};

const WEEK_DAYS = ['\u6708', '\u706b', '\u6c34', '\u6728', '\u91d1', '\u571f', '\u65e5'];
const HOURS = Array.from({ length: 15 }, (_, index) => index + 8);

const MOCK_EVENTS: CalendarEvent[] = [
  { id: 'event-standup', title: '\u56e2\u961f\u540c\u6b65', startHour: 9, endHour: 10 },
  { id: 'event-call', title: '\u4ea7\u54c1\u8bc4\u5ba1', startHour: 13, endHour: 14 },
  { id: 'event-review', title: '\u665a\u95f4\u590d\u76d8', startHour: 21, endHour: 22 },
];

function getTodayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function getHourFromTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp).getHours();
}

export function CalendarView({ tasks, onScheduleTask }: CalendarViewProps) {
  const [collapsed, setCollapsed] = useState(false);

  const scheduledTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === 'pending' &&
          task.scheduled_start_at !== null &&
          task.scheduled_end_at !== null,
      ),
    [tasks],
  );

  const unscheduledTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === 'pending' &&
          (task.scheduled_start_at === null || task.scheduled_end_at === null),
      ),
    [tasks],
  );

  const quickSchedule = (task: TaskRecord, index: number) => {
    const startHour = 16 + (index % 4);
    onScheduleTask(task.id, getTodayAt(startHour), getTodayAt(startHour, 45));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{'\u65e5\u5386'}</Text>
        <Text style={styles.title}>{'\u53cc\u8f74\u5e76\u8f68\u6392\u7a0b'}</Text>
      </View>

      <View style={styles.weekRow}>
        {WEEK_DAYS.map((day, index) => (
          <View key={day} style={[styles.dayPill, index === 0 && styles.dayPillActive]}>
            <Text style={[styles.dayText, index === 0 && styles.dayTextActive]}>{day}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.timeline} showsVerticalScrollIndicator={false}>
        {HOURS.map((hour) => {
          const events = MOCK_EVENTS.filter((event) => event.startHour === hour);
          const timeTasks = scheduledTasks.filter((task) => getHourFromTimestamp(task.scheduled_start_at) === hour);

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourText}>{`${String(hour).padStart(2, '0')}:00`}</Text>
              <View style={styles.track}>
                {events.length === 0 ? <View style={styles.emptyLine} /> : null}
                {events.map((event) => (
                  <View key={event.id} style={styles.eventCard}>
                    <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventTime}>{`${event.startHour}:00 - ${event.endHour}:00`}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.track}>
                {timeTasks.length === 0 ? <View style={styles.emptyLine} /> : null}
                {timeTasks.map((task) => (
                  <View key={task.id} style={styles.taskBox}>
                    <Text numberOfLines={2} style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.taskTime}>{'\u5f39\u6027\u65f6\u95f4\u76d2'}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.drawer}>
        <Pressable accessibilityRole="button" onPress={() => setCollapsed((value) => !value)} style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>{'\u5feb\u901f\u6392\u7a0b'}</Text>
          <Text style={styles.drawerToggle}>{collapsed ? '\u5c55\u5f00' : '\u6536\u8d77'}</Text>
        </Pressable>

        {!collapsed ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unscheduledList}>
            {unscheduledTasks.slice(0, 8).map((task, index) => (
              <Pressable
                key={task.id}
                accessibilityRole="button"
                onPress={() => quickSchedule(task, index)}
                style={styles.unscheduledChip}
              >
                <Text numberOfLines={1} style={styles.unscheduledText}>{task.title}</Text>
              </Pressable>
            ))}
            {unscheduledTasks.length === 0 ? <Text style={styles.emptyDrawer}>{'\u6ca1\u6709\u672a\u6392\u7a0b\u4efb\u52a1'}</Text> : null}
          </ScrollView>
        ) : null}
      </View>
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
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  dayPill: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
  },
  dayPillActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  dayText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '800',
  },
  dayTextActive: {
    color: '#FFFFFF',
  },
  timeline: {
    paddingHorizontal: 16,
    paddingBottom: 150,
  },
  hourRow: {
    minHeight: 76,
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECECEE',
    paddingTop: 8,
  },
  hourText: {
    width: 48,
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  track: {
    flex: 1,
    gap: 6,
  },
  emptyLine: {
    height: 1,
    marginTop: 16,
    backgroundColor: '#F4F4F6',
  },
  eventCard: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(142, 142, 147, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(142, 142, 147, 0.22)',
    padding: 10,
  },
  eventTitle: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '800',
  },
  eventTime: {
    marginTop: 4,
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  taskBox: {
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    padding: 10,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 1,
  },
  taskTitle: {
    color: '#1C1C1E',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  taskTime: {
    marginTop: 4,
    color: '#007AFF',
    fontSize: 11,
    fontWeight: '700',
  },
  drawer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: '#ECECEE',
    padding: 12,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '800',
  },
  drawerToggle: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '800',
  },
  unscheduledList: {
    paddingTop: 10,
    gap: 8,
  },
  unscheduledChip: {
    maxWidth: 178,
    borderRadius: 12,
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: '#ECECEE',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  unscheduledText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyDrawer: {
    color: '#8E8E93',
    fontSize: 13,
  },
});
