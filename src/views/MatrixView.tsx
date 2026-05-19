import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Layout,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { TaskRecord } from '../../database';
import { CARD_SURFACE_STYLE } from '../components/cardSurface';
import { SwipeableTaskRow } from '../components/SwipeableTaskRow';

export interface MatrixViewProps {
  tasks: TaskRecord[];
  onComplete: (id: string) => void;
  onFreeze: (id: string) => void;
  onFocus: (task: TaskRecord) => void;
  onTriggerAI: (task: TaskRecord) => void;
  allowPinchCollapse?: boolean;
  hapticsEnabled?: boolean;
}

const QUADRANTS = [
  { quadrant: 1, title: '\u91cd\u8981\u7d27\u6025', subtitle: '\u73b0\u5728\u5c31\u505a', color: '#FF3B30' },
  { quadrant: 2, title: '\u91cd\u8981\u4e0d\u6025', subtitle: '\u6df1\u5ea6\u63a8\u8fdb', color: '#007AFF' },
  { quadrant: 3, title: '\u7d27\u6025\u4e0d\u91cd', subtitle: '\u538b\u7f29\u5904\u7406', color: '#FF9500' },
  { quadrant: 4, title: '\u4e0d\u91cd\u4e0d\u6025', subtitle: '\u7a0d\u540e\u6574\u7406', color: '#8E8E93' },
] as const;

function getPendingTasks(tasks: TaskRecord[], quadrant: number) {
  return tasks.filter((task) => task.quadrant === quadrant && task.status === 'pending');
}

export function MatrixView({
  tasks,
  onComplete,
  onFreeze,
  onFocus,
  onTriggerAI,
  allowPinchCollapse = true,
  hapticsEnabled = true,
}: MatrixViewProps) {
  const [expandedQuadrant, setExpandedQuadrant] = useState<number | null>(null);
  const pinchScale = useSharedValue(1);

  useEffect(() => {
    pinchScale.value = 1;
  }, [expandedQuadrant, pinchScale]);

  const summaries = useMemo(
    () =>
      QUADRANTS.map((item) => {
        const pending = getPendingTasks(tasks, item.quadrant);
        return { ...item, pending };
      }),
    [tasks],
  );

  const expandedMeta = summaries.find((item) => item.quadrant === expandedQuadrant);
  const expandedTasks = expandedMeta?.pending ?? [];

  const collapse = () => {
    pinchScale.value = withSpring(1, { damping: 18, stiffness: 220 });
    setExpandedQuadrant(null);
  };

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(expandedQuadrant !== null && allowPinchCollapse)
        .onUpdate((event) => {
          pinchScale.value = Math.min(Math.max(event.scale, 0.8), 1.05);
        })
        .onEnd((event) => {
          if (allowPinchCollapse && event.scale < 0.92) {
            runOnJS(collapse)();
            return;
          }
          pinchScale.value = withSpring(1, { damping: 18, stiffness: 220 });
        }),
    [allowPinchCollapse, expandedQuadrant, pinchScale],
  );

  const expandedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinchScale.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{'\u56db\u8c61\u9650'}</Text>
        <Text style={styles.title}>{'\u628a\u6ce8\u610f\u529b\u653e\u56de\u6b63\u786e\u7684\u4f4d\u7f6e'}</Text>
      </View>

      {expandedMeta ? (
        <GestureDetector gesture={pinchGesture}>
          <Animated.View layout={Layout.springify()} style={[styles.expandedPanel, expandedStyle]}>
            <View style={styles.expandedHeader}>
              <View style={styles.expandedTitleBlock}>
                <View style={[styles.colorDot, { backgroundColor: expandedMeta.color }]} />
                <View style={styles.expandedCopy}>
                  <Text style={styles.expandedTitle}>{expandedMeta.title}</Text>
                  <Text style={styles.expandedSubtitle}>{'\u4ec5\u663e\u793a\u5f85\u5904\u7406\u4efb\u52a1'}</Text>
                </View>
              </View>
              <Pressable accessibilityRole="button" onPress={collapse} style={styles.closeButton}>
                <Text style={styles.closeText}>{'\u6536\u8d77'}</Text>
              </Pressable>
            </View>

            <FlatList
              data={expandedTasks}
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
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{'\u8fd9\u4e00\u683c\u5f88\u6e05\u723d'}</Text>
                  <Text style={styles.emptyBody}>{'\u6ca1\u6709\u5f85\u5904\u7406\u4efb\u52a1\uff0c\u7ee7\u7eed\u4fdd\u6301\u3002'}</Text>
                </View>
              }
              contentContainerStyle={styles.expandedList}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        </GestureDetector>
      ) : (
        <View style={styles.grid}>
          {summaries.map((item) => (
            <Animated.View key={item.quadrant} layout={Layout.springify()} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setExpandedQuadrant(item.quadrant)}
                  hitSlop={10}
                  style={styles.expandButton}
                >
                  <Text style={styles.expandText}>{'\u653e\u5927'}</Text>
                </Pressable>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              <View style={styles.countRow}>
                <Text style={styles.countNumber}>{item.pending.length}</Text>
                <Text style={styles.countLabel}>{'\u5f85\u5904\u7406'}</Text>
              </View>
              <View style={styles.previewList}>
                {item.pending.slice(0, 2).map((task) => (
                  <Text key={task.id} numberOfLines={1} style={styles.previewText}>
                    {task.title}
                  </Text>
                ))}
                {item.pending.length === 0 ? <Text style={styles.previewEmpty}>{'\u6682\u65e0\u4efb\u52a1'}</Text> : null}
              </View>
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9FB',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    paddingBottom: 14,
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
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    ...CARD_SURFACE_STYLE,
    width: '48%',
    minHeight: 178,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  expandButton: {
    borderRadius: 10,
    backgroundColor: '#F4F4F6',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  expandText: {
    color: '#1C1C1E',
    fontSize: 12,
    fontWeight: '700',
  },
  cardTitle: {
    marginTop: 18,
    color: '#1C1C1E',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  cardSubtitle: {
    marginTop: 3,
    color: '#8E8E93',
    fontSize: 13,
  },
  countRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  countNumber: {
    color: '#1C1C1E',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  countLabel: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '700',
  },
  previewList: {
    marginTop: 12,
    gap: 5,
  },
  previewText: {
    color: '#3A3A3C',
    fontSize: 12,
    lineHeight: 17,
  },
  previewEmpty: {
    color: '#C7C7CC',
    fontSize: 12,
  },
  expandedPanel: {
    ...CARD_SURFACE_STYLE,
    flex: 1,
    padding: 14,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  expandedTitleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandedCopy: {
    flex: 1,
  },
  expandedTitle: {
    color: '#1C1C1E',
    fontSize: 22,
    fontWeight: '800',
  },
  expandedSubtitle: {
    marginTop: 3,
    color: '#8E8E93',
    fontSize: 13,
  },
  closeButton: {
    borderRadius: 10,
    backgroundColor: '#F4F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '800',
  },
  expandedList: {
    paddingBottom: 16,
  },
  emptyState: {
    paddingVertical: 28,
    alignItems: 'center',
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
  },
});
