import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
  applyTaskTransaction,
  checkpointWal,
  ensureDemoTasks,
  initializeMyBrainDatabase,
  listTasks,
  scheduleTask,
  setTaskStatus,
  type TaskRecord,
  type TaskTransactionPlan,
} from './database';
import { BottomTabBar, type AppTab } from './src/components/BottomTabBar';
import { CalendarView } from './src/views/CalendarView';
import { ChatView } from './src/views/ChatView';
import { MatrixView } from './src/views/MatrixView';
import { SettingsView, type SettingsState } from './src/views/SettingsView';
import { TasksView } from './src/views/TasksView';

type LoadState = 'booting' | 'ready' | 'error';
type FocusState = 'idle' | 'active' | 'paused' | 'reason';
type InterruptionReason = 'external' | 'boredom' | 'meeting';

type FocusSession = {
  taskId: string;
  title: string;
  startedAt: number;
  remainingMs: number;
  state: FocusState;
};

const TAB_ORDER: AppTab[] = ['matrix', 'tasks', 'calendar', 'chat', 'settings'];
const DEFAULT_FLAGS: SettingsState = {
  matrixEnabled: true,
  calendarEnabled: true,
  tasksEnabled: true,
  haptics: true,
  demoSeed: true,
  pinchCollapse: true,
  denseLayout: false,
};

const FOCUS_DURATION_MS = 25 * 60 * 1000;

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getTodayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>('booting');
  const [activeTab, setActiveTab] = useState<AppTab>('matrix');
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [flags, setFlags] = useState<SettingsState>(DEFAULT_FLAGS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);
  const [pendingAbandonTaskId, setPendingAbandonTaskId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<InterruptionReason | null>(null);

  const reloadTasks = useCallback(async () => {
    const rows = await listTasks(300);
    setTasks(rows);
  }, []);

  const handleComplete = useCallback(
    async (id: string) => {
      await setTaskStatus(id, {
        status: 'completed',
        payload: { source: 'swipe', action: 'complete' },
      });
      await reloadTasks();
    },
    [reloadTasks],
  );

  const handleFreeze = useCallback(
    async (id: string, reason = '\u4ece\u6ed1\u52a8\u9762\u677f\u5b58\u4e3a\u6401\u7f6e') => {
      await setTaskStatus(id, {
        status: 'frozen',
        frozenReason: reason,
        payload: { source: 'swipe', action: 'freeze', reason },
      });
      await reloadTasks();
    },
    [reloadTasks],
  );

  const handleSubmitPlan = useCallback(
    async (plan: TaskTransactionPlan) => {
      await applyTaskTransaction(plan);
      await reloadTasks();
    },
    [reloadTasks],
  );

  const handleScheduleTask = useCallback(
    async (taskId: string, startAt: number, endAt: number) => {
      await scheduleTask({
        taskId,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        payload: { source: 'calendar', scheduled: true },
      });
      await reloadTasks();
    },
    [reloadTasks],
  );

  const openFocusSession = useCallback((task: TaskRecord) => {
    setFocusSession({
      taskId: task.id,
      title: task.title,
      startedAt: Date.now(),
      remainingMs: FOCUS_DURATION_MS,
      state: 'active',
    });
    setPendingAbandonTaskId(null);
    setSelectedReason(null);
  }, []);

  const requestAbandon = useCallback(() => {
    if (!focusSession) {
      return;
    }
    setPendingAbandonTaskId(focusSession.taskId);
    setSelectedReason(null);
    setFocusSession((current) =>
      current ? { ...current, state: 'reason' } : current,
    );
  }, [focusSession]);

  const confirmReason = useCallback(
    async (reason: InterruptionReason) => {
      if (!pendingAbandonTaskId) {
        return;
      }

      const reasonText =
        reason === 'external'
          ? '\u5916\u90e8\u6253\u6270'
          : reason === 'boredom'
            ? '\u5206\u5fc3\u6446\u70d8'
            : '\u4e34\u65f6\u4f1a\u8bae';

      setSelectedReason(reason);
      await handleFreeze(pendingAbandonTaskId, reasonText);
      setFocusSession(null);
      setPendingAbandonTaskId(null);
    },
    [handleFreeze, pendingAbandonTaskId],
  );

  const cancelReason = useCallback(() => {
    setSelectedReason(null);
    setPendingAbandonTaskId(null);
    setFocusSession((current) =>
      current ? { ...current, state: 'active' } : current,
    );
  }, []);

  const toggleFocusPause = useCallback(() => {
    setFocusSession((current) => {
      if (!current) {
        return current;
      }

      if (current.state === 'active') {
        return { ...current, state: 'paused' };
      }

      if (current.state === 'paused') {
        return { ...current, state: 'active', startedAt: Date.now() };
      }

      return current;
    });
  }, []);

  const finishFocus = useCallback(async () => {
    if (!focusSession) {
      return;
    }
    await handleComplete(focusSession.taskId);
    setFocusSession(null);
  }, [focusSession, handleComplete]);

  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      try {
        await initializeMyBrainDatabase();
        if (flags.demoSeed) {
          await ensureDemoTasks();
        }
        if (!alive) {
          return;
        }
        await reloadTasks();
        setLoadState('ready');
      } catch (error) {
        if (!alive) {
          return;
        }
        setLoadState('error');
        setErrorMessage(error instanceof Error ? error.message : '\u672c\u5730 SQLite \u521d\u59cb\u5316\u5931\u8d25');
      }
    };

    bootstrap();

    return () => {
      alive = false;
    };
  }, [flags.demoSeed, reloadTasks]);

  useEffect(() => {
    if (!focusSession || focusSession.state !== 'active') {
      return;
    }

    const interval = setInterval(() => {
      setFocusSession((current) => {
        if (!current || current.state !== 'active') {
          return current;
        }

        const elapsed = Date.now() - current.startedAt;
        const remainingMs = Math.max(0, FOCUS_DURATION_MS - elapsed);
        if (remainingMs <= 0) {
          void handleComplete(current.taskId);
          return null;
        }

        return { ...current, remainingMs };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [focusSession, handleComplete]);

  const visibleTabs = useMemo(
    () =>
      TAB_ORDER.filter((tab) => {
        if (tab === 'matrix') return flags.matrixEnabled;
        if (tab === 'calendar') return flags.calendarEnabled;
        if (tab === 'tasks') return flags.tasksEnabled;
        return true;
      }),
    [flags],
  );

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'matrix');
    }
  }, [activeTab, visibleTabs]);

  const renderScreen = () => {
    switch (activeTab) {
      case 'matrix':
        return (
          <MatrixView
            tasks={tasks}
            onComplete={handleComplete}
            onFreeze={(id) => handleFreeze(id)}
            onFocus={openFocusSession}
            onTriggerAI={() => setActiveTab('chat')}
            allowPinchCollapse={flags.pinchCollapse}
            hapticsEnabled={flags.haptics}
          />
        );
      case 'tasks':
        return (
          <TasksView
            tasks={tasks}
            onComplete={handleComplete}
            onFreeze={(id) => handleFreeze(id)}
            onFocus={openFocusSession}
            onTriggerAI={() => setActiveTab('chat')}
            hapticsEnabled={flags.haptics}
          />
        );
      case 'calendar':
        return <CalendarView tasks={tasks} onScheduleTask={handleScheduleTask} />;
      case 'chat':
        return <ChatView onSubmitPlan={handleSubmitPlan} />;
      case 'settings':
      default:
        return (
          <SettingsView
            values={flags}
            onChangeValue={(key, next) => {
              setFlags((current) => ({ ...current, [key]: next }));
            }}
            onSyncBackup={async () => {
              await checkpointWal();
            }}
          />
        );
    }
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.shell}>
            <View style={styles.statusBar}>
              <View style={styles.brandBlock}>
                <Text style={styles.brand}>{'MyBrain AI'}</Text>
                <Text style={styles.statusText}>
                  {loadState === 'booting'
                    ? '\u6b63\u5728\u542f\u52a8\u672c\u5730 SQLite'
                    : loadState === 'ready'
                      ? '\u6838\u5fc3\u5df2\u7ecf\u5c31\u4f4d'
                      : '\u6570\u636e\u5e93\u51fa\u73b0\u95ee\u9898'}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{tasks.length}</Text>
              </View>
            </View>

            {loadState === 'error' && errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={[styles.content, flags.denseLayout && styles.contentDense]}>
              {renderScreen()}
            </View>

            <BottomTabBar activeTab={activeTab} onChangeTab={setActiveTab} tabs={visibleTabs} />
          </View>

          {focusSession ? (
            <View style={styles.focusOverlay}>
              <View style={styles.focusCard}>
                <View style={styles.focusHeader}>
                  <View style={styles.focusTitleBlock}>
                    <Text style={styles.focusKicker}>{'\u4e13\u6ce8'}</Text>
                    <Text style={styles.focusTitle}>{focusSession.title}</Text>
                  </View>
                  <Text style={styles.focusClock}>{formatRemaining(focusSession.remainingMs)}</Text>
                </View>

                <Text style={styles.focusBody}>
                  {focusSession.state === 'paused'
                    ? '\u5df2\u6682\u505c\uff0c\u53ef\u4ee5\u7ee7\u7eed\u6216\u653e\u5f03\u3002'
                    : '\u7acb\u5373\u5173\u6ce8\u8fd9\u4ef6\u4e8b\u3002'}
                </Text>

                <View style={styles.focusActions}>
                  <Pressable accessibilityRole="button" onPress={toggleFocusPause} style={styles.focusSecondary}>
                    <Text style={styles.focusSecondaryText}>
                      {focusSession.state === 'paused' ? '\u7ee7\u7eed' : '\u6682\u505c'}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={requestAbandon} style={styles.focusSecondary}>
                    <Text style={styles.focusSecondaryText}>{'\u653e\u5f03'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={finishFocus} style={styles.focusPrimary}>
                    <Text style={styles.focusPrimaryText}>{'\u5b8c\u6210'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {pendingAbandonTaskId ? (
            <View style={styles.reasonOverlay}>
              <View style={styles.reasonCard}>
                <Text style={styles.reasonTitle}>{'\u8bf7\u9009\u62e9\u6253\u65ad\u539f\u56e0'}</Text>
                <Text style={styles.reasonBody}>{'\u9009\u5b8c\u540e\u624d\u4f1a\u5c06\u4efb\u52a1\u5b89\u5168\u8f6c\u4e3a\u6401\u7f6e\u3002'}</Text>
                <View style={styles.reasonGrid}>
                  {[
                    ['external', '\u5916\u90e8\u6253\u6270'],
                    ['boredom', '\u5206\u5fc3\u6446\u70d8'],
                    ['meeting', '\u4e34\u65f6\u4f1a\u8bae'],
                  ].map(([key, label]) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      onPress={() => confirmReason(key as InterruptionReason)}
                      style={styles.reasonChip}
                    >
                      <Text style={styles.reasonChipText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable accessibilityRole="button" onPress={cancelReason} style={styles.reasonCancel}>
                  <Text style={styles.reasonCancelText}>{'\u53d6\u6d88'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <StatusBar style="dark" />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const baseCard = {
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#ECECEE',
  shadowColor: '#1C1C1E',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.03,
  shadowRadius: 12,
  elevation: 1,
} as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9F9FB',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F9F9FB',
  },
  shell: {
    flex: 1,
    backgroundColor: '#F9F9FB',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandBlock: {
    flex: 1,
    gap: 2,
  },
  brand: {
    color: '#1C1C1E',
    fontSize: 17,
    fontWeight: '800',
  },
  statusText: {
    color: '#8E8E93',
    fontSize: 12,
  },
  statusPill: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    paddingHorizontal: 12,
  },
  statusPillText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '800',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#F4C7C3',
    padding: 12,
  },
  errorText: {
    color: '#B00020',
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  contentDense: {
    paddingHorizontal: 0,
  },
  focusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 30, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  focusCard: {
    ...baseCard,
    width: '100%',
    padding: 16,
    gap: 10,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusTitleBlock: {
    flex: 1,
    gap: 4,
  },
  focusKicker: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '800',
  },
  focusTitle: {
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '800',
  },
  focusClock: {
    color: '#007AFF',
    fontSize: 28,
    fontWeight: '800',
  },
  focusBody: {
    color: '#3A3A3C',
    fontSize: 14,
    lineHeight: 20,
  },
  focusActions: {
    flexDirection: 'row',
    gap: 10,
  },
  focusSecondary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F4F4F6',
  },
  focusSecondaryText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '800',
  },
  focusPrimary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
  },
  focusPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  reasonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 30, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  reasonCard: {
    ...baseCard,
    width: '100%',
    padding: 16,
    gap: 10,
  },
  reasonTitle: {
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '800',
  },
  reasonBody: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 19,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  reasonChip: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F6',
    paddingHorizontal: 14,
  },
  reasonChipText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '800',
  },
  reasonCancel: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
  },
  reasonCancelText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '800',
  },
});
