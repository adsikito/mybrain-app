import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Calendar from 'expo-calendar';

import type { TaskRecord } from '../../database';
import { CARD_SURFACE_STYLE } from '../components/cardSurface';

export interface CalendarViewProps {
  tasks: TaskRecord[];
  dayStartHour: number;
  dayEndHour: number;
  onScheduleTask: (taskId: string, startAt: number, endAt: number) => void;
}

type SystemCalendarEvent = {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
};

type PermissionState = 'loading' | 'granted' | 'denied' | 'unavailable';

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getTodayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function getTodayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function timestampFromCalendarDate(value: string | Date | number | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getHourFromTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).getHours();
}

function getTimeRangeLabel(startAt: number | null, endAt: number | null) {
  if (!startAt || !endAt) {
    return '时间未定';
  }

  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')} - ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
}

function clampHour(value: number, fallback: number) {
  if (Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(23, Math.max(0, Math.round(value)));
}

export function CalendarView({ tasks, dayStartHour, dayEndHour, onScheduleTask }: CalendarViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('loading');
  const [systemEvents, setSystemEvents] = useState<SystemCalendarEvent[]>([]);

  const normalizedStartHour = clampHour(dayStartHour, 8);
  const normalizedEndHour = Math.max(normalizedStartHour + 1, clampHour(dayEndHour, 22));
  const hours = useMemo(
    () => Array.from({ length: normalizedEndHour - normalizedStartHour + 1 }, (_, index) => normalizedStartHour + index),
    [normalizedEndHour, normalizedStartHour],
  );
  const dayIndex = (new Date().getDay() + 6) % 7;

  useEffect(() => {
    let alive = true;

    const loadSystemEvents = async () => {
      setPermissionState('loading');
      try {
        const permission = await Calendar.requestCalendarPermissionsAsync();
        if (!alive) {
          return;
        }

        if (permission.status !== 'granted') {
          setPermissionState('denied');
          setSystemEvents([]);
          return;
        }

        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const calendarIds = calendars.map((item) => item.id).filter(Boolean);
        if (calendarIds.length === 0) {
          setPermissionState('granted');
          setSystemEvents([]);
          return;
        }

        const { start, end } = getTodayBounds();
        const events = await Calendar.getEventsAsync(calendarIds, start, end);
        if (!alive) {
          return;
        }

        setSystemEvents(
          events
            .map((event) => {
              const startAt = timestampFromCalendarDate(event.startDate);
              const endAt = timestampFromCalendarDate(event.endDate);
              if (!startAt || !endAt) {
                return null;
              }

              return {
                id: event.id,
                title: event.title || '未命名日程',
                startAt,
                endAt,
              };
            })
            .filter((event): event is SystemCalendarEvent => event !== null)
            .sort((left, right) => left.startAt - right.startAt),
        );
        setPermissionState('granted');
      } catch {
        if (alive) {
          setPermissionState('unavailable');
          setSystemEvents([]);
        }
      }
    };

    void loadSystemEvents();

    return () => {
      alive = false;
    };
  }, []);

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
    const hourRange = Math.max(1, normalizedEndHour - normalizedStartHour);
    const startHour = normalizedStartHour + (index % hourRange);
    onScheduleTask(task.id, getTodayAt(startHour), getTodayAt(startHour, 45));
  };

  const permissionCopy =
    permissionState === 'loading'
      ? '正在读取系统日历'
      : permissionState === 'granted'
        ? systemEvents.length === 0
          ? '今日没有系统日程'
          : '系统日历已接入'
        : permissionState === 'denied'
          ? '未获得系统日历权限'
          : '当前平台暂不可读取系统日历';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>日历</Text>
        <Text style={styles.title}>双轴并轨排程</Text>
      </View>

      <View style={styles.weekRow}>
        {WEEK_DAYS.map((day, index) => (
          <View key={day} style={[styles.dayPill, index === dayIndex && styles.dayPillActive]}>
            <Text style={[styles.dayText, index === dayIndex && styles.dayTextActive]}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trackLegend}>
        <Text style={styles.legendText}>左轨 系统日程</Text>
        <Text style={styles.legendText}>右轨 弹性待办</Text>
      </View>

      <Text style={styles.permissionText}>{permissionCopy}</Text>

      <ScrollView contentContainerStyle={styles.timeline} showsVerticalScrollIndicator={false}>
        {hours.map((hour) => {
          const events = systemEvents.filter((event) => getHourFromTimestamp(event.startAt) === hour);
          const timeTasks = scheduledTasks.filter((task) => getHourFromTimestamp(task.scheduled_start_at) === hour);

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourText}>{`${String(hour).padStart(2, '0')}:00`}</Text>
              <View style={styles.track}>
                {events.length === 0 ? <View style={styles.emptyLine} /> : null}
                {events.map((event) => (
                  <View key={event.id} style={styles.eventCard}>
                    <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventTime}>{getTimeRangeLabel(event.startAt, event.endAt)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.track}>
                {timeTasks.length === 0 ? <View style={styles.emptyLine} /> : null}
                {timeTasks.map((task) => (
                  <View key={task.id} style={styles.taskBox}>
                    <Text numberOfLines={2} style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.taskTime}>{getTimeRangeLabel(task.scheduled_start_at, task.scheduled_end_at)}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.drawer}>
        <Pressable accessibilityRole="button" onPress={() => setCollapsed((value) => !value)} style={styles.drawerHeader}>
          <View style={styles.drawerTitleBlock}>
            <Text style={styles.drawerTitle}>快速排程</Text>
            <Text style={styles.drawerDetail}>点击未排程任务，把它放进当前作息时间轴的空白段</Text>
          </View>
          <Text style={styles.drawerToggle}>{collapsed ? '展开' : '收起'}</Text>
        </Pressable>

        {!collapsed ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unscheduledList}>
            {unscheduledTasks.slice(0, 10).map((task, index) => (
              <Pressable
                key={task.id}
                accessibilityRole="button"
                onPress={() => quickSchedule(task, index)}
                style={styles.unscheduledChip}
              >
                <Text numberOfLines={1} style={styles.unscheduledText}>{task.title}</Text>
              </Pressable>
            ))}
            {unscheduledTasks.length === 0 ? <Text style={styles.emptyDrawer}>没有未排程任务</Text> : null}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
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
  trackLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 72,
    paddingBottom: 4,
  },
  legendText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
  },
  permissionText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  timeline: {
    paddingHorizontal: 16,
    paddingBottom: 154,
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
    minWidth: 0,
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
    ...CARD_SURFACE_STYLE,
    minHeight: 58,
    padding: 10,
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
    gap: 12,
  },
  drawerTitleBlock: {
    flex: 1,
    gap: 2,
  },
  drawerTitle: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '800',
  },
  drawerDetail: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 16,
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
