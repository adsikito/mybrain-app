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

export interface SwipeableTaskRowProps {
  task: TaskRecord;
  onComplete: (id: string) => void;
  onFreeze: (id: string) => void;
  onTriggerAI?: (task: TaskRecord) => void;
  onFocus?: (task: TaskRecord) => void;
  enableHaptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ACTION_WIDTH = 150;
const COMPLETE_DISTANCE = 96;
const OPEN_DISTANCE = -132;

const QUADRANT_COLORS: Record<number, string> = {
  1: '#FF3B30',
  2: '#007AFF',
  3: '#FF9500',
  4: '#8E8E93',
};

function getQuadrantText(quadrant: number) {
  switch (quadrant) {
    case 1:
      return '\u91cd\u8981\u7d27\u6025';
    case 2:
      return '\u91cd\u8981\u4e0d\u6025';
    case 3:
      return '\u7d27\u6025\u4e0d\u91cd';
    case 4:
      return '\u7a0d\u540e\u6574\u7406';
    default:
      return '\u672a\u5f52\u7c7b';
  }
}

function getStatusText(status: TaskRecord['status']) {
  switch (status) {
    case 'completed':
      return '\u5df2\u5b8c\u6210';
    case 'frozen':
      return '\u5df2\u6401\u7f6e';
    default:
      return '\u5f85\u5904\u7406';
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
  onFocus,
  enableHaptics = true,
  style,
}: SwipeableTaskRowProps) {
  const translateX = useSharedValue(0);
  const quadrantColor = QUADRANT_COLORS[task.quadrant] ?? '#8E8E93';

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, {
      damping: 19,
      stiffness: 240,
    });
  }, [translateX]);

  const vibrate = useCallback(() => {
    if (enableHaptics) {
      Vibration.vibrate(10);
    }
  }, [enableHaptics]);

  const complete = useCallback(() => {
    vibrate();
    onComplete(task.id);
  }, [onComplete, task.id, vibrate]);

  const freeze = useCallback(() => {
    vibrate();
    onFreeze(task.id);
  }, [onFreeze, task.id, vibrate]);

  const triggerAI = useCallback(() => {
    resetPosition();
    onTriggerAI?.(task);
  }, [onTriggerAI, resetPosition, task]);

  const triggerFocus = useCallback(() => {
    onFocus?.(task);
  }, [onFocus, task]);

  const settleThen = useCallback(
    (action: () => void) => {
      translateX.value = withTiming(0, { duration: 130 }, (finished) => {
        if (finished) {
          runOnJS(action)();
        }
      });
    },
    [translateX],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 20, right: 20, top: 6, bottom: 6 })
        .activeOffsetX([-10, 10])
        .onUpdate((event) => {
          const nextX =
            event.translationX > 0
              ? clamp(event.translationX * 0.86, 0, ACTION_WIDTH)
              : clamp(event.translationX, -ACTION_WIDTH, 0);
          translateX.value = nextX;
        })
        .onEnd((event) => {
          if (event.translationX > COMPLETE_DISTANCE || event.velocityX > 900) {
            translateX.value = withTiming(ACTION_WIDTH, { duration: 170 }, (finished) => {
              if (finished) {
                runOnJS(complete)();
                translateX.value = withSpring(0, { damping: 20, stiffness: 260 });
              }
            });
            return;
          }

          if (event.translationX < -64 || event.velocityX < -650) {
            translateX.value = withSpring(OPEN_DISTANCE, {
              damping: 18,
              stiffness: 230,
            });
            return;
          }

          runOnJS(resetPosition)();
        }),
    [complete, resetPosition, translateX],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      <View style={styles.underlay}>
        <View style={styles.completeUnderlay}>
          <Text style={styles.completeText}>{'\u5b8c\u6210'}</Text>
        </View>
        <View style={styles.actionPanel}>
          <Pressable
            accessibilityRole="button"
            onPress={() => settleThen(freeze)}
            style={styles.actionButton}
          >
            <Text style={styles.actionButtonText}>{'\u6401\u7f6e'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={triggerAI} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{'AI\u62c6\u89e3'}</Text>
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.front, animatedStyle, task.status === 'frozen' && styles.frozen]}>
          <View style={[styles.indicator, { backgroundColor: quadrantColor }]} />

          <Pressable
            accessibilityRole="button"
            onPress={() => settleThen(complete)}
            style={[styles.checkCircle, { borderColor: quadrantColor }]}
          >
            {task.status === 'completed' ? <View style={[styles.checkDot, { backgroundColor: quadrantColor }]} /> : null}
          </Pressable>

          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text numberOfLines={2} style={styles.title}>
                {task.title}
              </Text>
              {onFocus ? (
                <Pressable accessibilityRole="button" onPress={triggerFocus} style={styles.focusButton}>
                  <Text style={styles.focusButtonText}>25</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.quadrantText, { color: quadrantColor }]}>
                {getQuadrantText(task.quadrant)}
              </Text>
              <Text style={styles.dot}>/</Text>
              <Text style={styles.statusText}>{getStatusText(task.status)}</Text>
              {task.frozen_reason ? (
                <>
                  <Text style={styles.dot}>/</Text>
                  <Text numberOfLines={1} style={styles.reasonText}>
                    {task.frozen_reason}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeableTaskRow = memo(SwipeableTaskRowComponent);

const styles = StyleSheet.create({
  container: {
    minHeight: 68,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 5,
    backgroundColor: '#FFFFFF',
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    backgroundColor: '#F9F9FB',
  },
  completeUnderlay: {
    width: ACTION_WIDTH,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 22,
    backgroundColor: '#EAF8EE',
  },
  completeText: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '700',
  },
  actionPanel: {
    marginLeft: 'auto',
    width: ACTION_WIDTH,
    flexDirection: 'row',
    backgroundColor: '#F4F4F6',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E5EA',
  },
  actionButtonText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
  },
  front: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 1,
  },
  frozen: {
    opacity: 0.62,
  },
  indicator: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 14,
    marginRight: 10,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  copy: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    color: '#1C1C1E',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  focusButton: {
    width: 32,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: '#ECECEE',
  },
  focusButtonText: {
    color: '#1C1C1E',
    fontSize: 11,
    fontWeight: '800',
  },
  metaRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  quadrantText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  dot: {
    color: '#C7C7CC',
    fontSize: 12,
    lineHeight: 17,
  },
  statusText: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  reasonText: {
    flexShrink: 1,
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 17,
  },
});

export default SwipeableTaskRow;
