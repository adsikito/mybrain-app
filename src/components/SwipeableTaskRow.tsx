import React, { memo, useCallback, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { TaskRecord } from '../../database';

export type SwipeableTaskRowTask = Omit<TaskRecord, 'status'> & {
  status: TaskRecord['status'] | 'in_progress';
  quadrant?: number;
  duration?: number;
  actual_duration?: number;
  parent_id?: string | null;
};

export interface SwipeableTaskRowProps {
  task: SwipeableTaskRowTask;
  onComplete: (id: string) => void;
  onFreeze: (id: string) => void;
  onTriggerAI?: (task: SwipeableTaskRowTask) => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const ACTION_WIDTH = 160;
const RIGHT_TRIGGER_DISTANCE = ACTION_WIDTH * 0.35;
const LEFT_TRIGGER_DISTANCE = -ACTION_WIDTH * 0.35;

function getStatusLabel(status: SwipeableTaskRowTask['status']) {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'frozen':
      return 'Frozen';
    case 'in_progress':
      return 'In progress';
    default:
      return 'Pending';
  }
}

function getStatusColor(status: SwipeableTaskRowTask['status']) {
  switch (status) {
    case 'completed':
      return '#10b981';
    case 'frozen':
      return '#8b5cf6';
    case 'in_progress':
      return '#f59e0b';
    default:
      return '#2563eb';
  }
}

function getStatusSurface(status: SwipeableTaskRowTask['status']) {
  switch (status) {
    case 'completed':
      return '#ecfdf5';
    case 'frozen':
      return '#f5f3ff';
    case 'in_progress':
      return '#fffbeb';
    default:
      return '#eff6ff';
  }
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function SwipeableTaskRowComponent({
  task,
  onComplete,
  onFreeze,
  onTriggerAI,
  children,
  style,
}: SwipeableTaskRowProps) {
  const translateX = useSharedValue(0);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, {
      damping: 18,
      stiffness: 220,
    });
  }, [translateX]);

  const triggerComplete = useCallback(() => {
    Vibration.vibrate(12);
    onComplete(task.id);
  }, [onComplete, task.id]);

  const triggerFreeze = useCallback(() => {
    Vibration.vibrate(12);
    onFreeze(task.id);
  }, [onFreeze, task.id]);

  const triggerAI = useCallback(() => {
    if (onTriggerAI) {
      onTriggerAI(task);
    }
  }, [onTriggerAI, task]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 20, right: 20, top: 6, bottom: 6 })
        .activeOffsetX([-10, 10])
        .onUpdate((event) => {
          translateX.value = clamp(event.translationX, -ACTION_WIDTH, ACTION_WIDTH);
        })
        .onEnd((event) => {
          const shouldComplete =
            event.translationX > RIGHT_TRIGGER_DISTANCE || event.velocityX > 900;
          const shouldFreeze =
            event.translationX < LEFT_TRIGGER_DISTANCE || event.velocityX < -900;

          if (shouldComplete) {
            translateX.value = withTiming(ACTION_WIDTH, { duration: 160 }, (finished) => {
              if (finished) {
                runOnJS(triggerComplete)();
                translateX.value = withSpring(0, {
                  damping: 18,
                  stiffness: 240,
                });
              }
            });
            return;
          }

          if (shouldFreeze) {
            translateX.value = withTiming(-ACTION_WIDTH, { duration: 160 }, (finished) => {
              if (finished) {
                runOnJS(triggerFreeze)();
                translateX.value = withSpring(0, {
                  damping: 18,
                  stiffness: 240,
                });
              }
            });
            return;
          }

          runOnJS(resetPosition)();
        }),
    [resetPosition, triggerComplete, triggerFreeze, translateX],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const statusColor = getStatusColor(task.status);
  const statusSurface = getStatusSurface(task.status);
  const statusLabel = getStatusLabel(task.status);

  const metaChips = useMemo(() => {
    const chips: string[] = [];

    if (typeof task.quadrant === 'number') {
      chips.push(`Q${task.quadrant}`);
    }

    if (typeof task.duration === 'number') {
      chips.push(`${task.duration}m`);
    }

    if (typeof task.actual_duration === 'number') {
      chips.push(`actual ${task.actual_duration}m`);
    }

    if (task.parent_split_id) {
      chips.push('split');
    }

    return chips;
  }, [task.actual_duration, task.duration, task.parent_split_id, task.quadrant]);

  return (
    <View style={styles.container}>
      <View style={styles.underlay}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            resetPosition();
            triggerComplete();
          }}
          style={[styles.action, styles.completeAction]}
        >
          <Text style={styles.actionText}>完成</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            resetPosition();
            triggerFreeze();
          }}
          style={[styles.action, styles.freezeAction]}
        >
          <Text style={styles.actionText}>冻结</Text>
        </Pressable>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.front,
            { backgroundColor: statusSurface, borderLeftColor: statusColor },
            animatedStyle,
            style,
            task.status === 'frozen' && styles.frozen,
          ]}
        >
          {children ? (
            children
          ) : (
            <View style={styles.content}>
              <View style={styles.headingRow}>
                <Text numberOfLines={1} style={styles.title}>
                  {task.title}
                </Text>
                <View style={[styles.statusPill, { borderColor: statusColor }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                {metaChips.map((chip) => (
                  <View key={chip} style={styles.metaChip}>
                    <Text numberOfLines={1} style={styles.metaText}>
                      {chip}
                    </Text>
                  </View>
                ))}
                {task.frozen_reason ? (
                  <Text numberOfLines={1} style={styles.reason}>
                    {task.frozen_reason}
                  </Text>
                ) : null}
              </View>

              {onTriggerAI ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={triggerAI}
                  style={styles.aiButton}
                >
                  <Text style={styles.aiButtonText}>AI拆解</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeableTaskRow = memo(SwipeableTaskRowComponent);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  completeAction: {
    backgroundColor: '#059669',
  },
  freezeAction: {
    backgroundColor: '#7c3aed',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  front: {
    borderLeftWidth: 4,
    borderRadius: 14,
    minHeight: 72,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  frozen: {
    opacity: 0.62,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#e2e8f0',
  },
  metaText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  reason: {
    flexShrink: 1,
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
  },
  aiButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
  },
  aiButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default SwipeableTaskRow;
