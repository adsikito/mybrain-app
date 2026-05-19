import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { TaskInput, TaskTransactionPlan } from '../../database';

type PlanStatus = 'draft' | 'submitting' | 'submitted' | 'error';

type ChatMessage =
  | {
      id: string;
      kind: 'text';
      role: 'assistant' | 'user';
      text: string;
    }
  | {
      id: string;
      kind: 'plan';
      role: 'assistant';
      plan: TaskTransactionPlan;
      status: PlanStatus;
      errorMessage?: string;
    };

export interface ChatViewProps {
  onSubmitPlan: (plan: TaskTransactionPlan) => Promise<void>;
}

const SPLIT_KEYWORD = '\u62c6\u89e3';
const POSTPONE_KEYWORD = '\u63a8\u8fdf';

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'hello',
    kind: 'text',
    role: 'assistant',
    text: '\u6211\u53ea\u4f1a\u5148\u8d77\u8349\u4e8b\u52a1\u5361\uff0c\u7b49\u4f60\u786e\u8ba4\u540e\u518d\u5199\u5165\u672c\u5730\u3002',
  },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function shorten(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function extractActionItems(sourceText: string) {
  const stripped = sourceText
    .replace(SPLIT_KEYWORD, '')
    .replace(POSTPONE_KEYWORD, '')
    .replace(/\s+/g, ' ')
    .trim();
  const pieces = stripped
    .split(/[,.;/|]+/u)
    .map((piece) => piece.trim())
    .filter(Boolean);
  return pieces.length > 0 ? pieces : [sourceText.trim()];
}

function buildTransactionPlan(sourceText: string): TaskTransactionPlan | null {
  const text = sourceText.trim();
  if (!text) {
    return null;
  }

  const hasSplit = text.includes(SPLIT_KEYWORD);
  const hasPostpone = text.includes(POSTPONE_KEYWORD);
  if (!hasSplit && !hasPostpone) {
    return null;
  }

  const mode = hasPostpone ? 'postpone' : 'split';
  const planId = `chat-plan-${Date.now()}`;
  const parentId = `${planId}-parent`;
  const status: TaskInput['status'] = mode === 'postpone' ? 'frozen' : 'pending';
  const items = extractActionItems(text).slice(0, 4);

  return {
    id: planId,
    title: mode === 'split' ? '\u62c6\u89e3\u5efa\u8bae' : '\u63a8\u8fdf\u5efa\u8bae',
    sourceText: text,
    operations: [
      {
        kind: 'upsert',
        task: {
          id: parentId,
          title: shorten(text, 32),
          status,
          quadrant: mode === 'split' ? 2 : 3,
          frozenReason: mode === 'postpone' ? '\u7531\u52a9\u7406\u5efa\u8bae\u63a8\u8fdf' : null,
          payload: { source: 'chat', mode, sourceText: text },
        },
      },
      ...items.map((item, index) => ({
        kind: 'upsert' as const,
        task: {
          id: `${planId}-item-${index + 1}`,
          title: shorten(item, 42),
          status,
          quadrant: mode === 'split' ? 2 : 3,
          parentSplitId: parentId,
          frozenReason: mode === 'postpone' ? '\u7531\u52a9\u7406\u5efa\u8bae\u63a8\u8fdf' : null,
          payload: { source: 'chat', mode, sourceText: text, index: index + 1 },
        },
      })),
    ],
  };
}

export function ChatView({ onSubmitPlan }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const canSend = draft.trim().length > 0;

  const updatePlanStatus = (id: string, status: PlanStatus, errorMessage?: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.kind === 'plan' && message.id === id
          ? { ...message, status, errorMessage: status === 'error' ? errorMessage : undefined }
          : message,
      ),
    );
  };

  const confirmPlan = async (id: string, plan: TaskTransactionPlan) => {
    updatePlanStatus(id, 'submitting');
    try {
      await onSubmitPlan(plan);
      updatePlanStatus(id, 'submitted');
      setMessages((current) => [
        ...current,
        {
          id: makeId('assistant'),
          kind: 'text',
          role: 'assistant',
          text: '\u5df2\u5b89\u5168\u5bfc\u5165\u672c\u5730 SQLite\u3002',
        },
      ]);
    } catch (error) {
      updatePlanStatus(id, 'error', error instanceof Error ? error.message : '\u5bfc\u5165\u5931\u8d25');
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const plan = buildTransactionPlan(text);
    setMessages((current) => [
      ...current,
      { id: makeId('user'), kind: 'text', role: 'user', text },
      plan
        ? { id: makeId('plan'), kind: 'plan', role: 'assistant', plan, status: 'draft' }
        : {
            id: makeId('assistant'),
            kind: 'text',
            role: 'assistant',
            text: '\u6211\u5df2\u8bb0\u4e0b\uff0c\u4f46\u8fd9\u6761\u6ca1\u6709\u89e6\u53d1\u672c\u5730\u4e8b\u52a1\u3002',
          },
    ]);
    setDraft('');
  };

  const footer = useMemo(
    () => (
      <View style={styles.composer}>
        <TextInput
          placeholder="\u8ddf MyBrain \u8bf4\u4e00\u53e5"
          placeholderTextColor="#8E8E93"
          value={draft}
          onChangeText={setDraft}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!canSend}
          onPress={sendMessage}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>{'\u53d1\u9001'}</Text>
        </Pressable>
      </View>
    ),
    [canSend, draft],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>{'\u52a9\u7406'}</Text>
        <Text style={styles.title}>{'\u5148\u786e\u8ba4\uff0c\u518d\u5199\u5165'}</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'plan') {
            return (
              <View style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleBlock}>
                    <Text style={styles.planTitle}>{item.plan.title}</Text>
                    <Text style={styles.planSubtitle}>{'\u4e8b\u52a1\u786e\u8ba4\u5361'}</Text>
                  </View>
                  <Text style={styles.planStatus}>{item.status}</Text>
                </View>
                <Text style={styles.planText}>{item.plan.sourceText}</Text>
                <View style={styles.operationBox}>
                  <Text style={styles.operationLabel}>{'\u5c06\u5199\u5165\u7684\u4efb\u52a1'}</Text>
                  {item.plan.operations.map((operation) =>
                    operation.kind === 'upsert' ? (
                      <Text key={operation.task.id} numberOfLines={1} style={styles.operationText}>
                        {operation.task.title}
                      </Text>
                    ) : null,
                  )}
                </View>
                {item.errorMessage ? <Text style={styles.errorText}>{item.errorMessage}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={item.status === 'submitting' || item.status === 'submitted'}
                  onPress={() => confirmPlan(item.id, item.plan)}
                  style={[
                    styles.confirmButton,
                    (item.status === 'submitting' || item.status === 'submitted') && styles.confirmButtonDisabled,
                  ]}
                >
                  <Text style={styles.confirmText}>{'\u786e\u8ba4\u5e76\u5bfc\u5165\u672c\u5730'}</Text>
                </Pressable>
              </View>
            );
          }

          return (
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.bubbleText, item.role === 'user' && styles.userText]}>{item.text}</Text>
            </View>
          );
        }}
      />

      {footer}
    </KeyboardAvoidingView>
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ECECEE',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  bubbleText: {
    color: '#1C1C1E',
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: '#FFFFFF',
  },
  planCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    padding: 14,
    gap: 12,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 1,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitleBlock: {
    flex: 1,
    gap: 4,
  },
  planTitle: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '800',
  },
  planSubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  planStatus: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '800',
  },
  planText: {
    color: '#3A3A3C',
    fontSize: 14,
    lineHeight: 20,
  },
  operationBox: {
    borderRadius: 12,
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#ECECEE',
    padding: 12,
    gap: 6,
  },
  operationLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '800',
  },
  operationText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
  },
  confirmButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#F9F9FB',
    borderTopWidth: 1,
    borderTopColor: '#ECECEE',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 104,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEE',
    color: '#1C1C1E',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  sendButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
  },
  sendButtonDisabled: {
    opacity: 0.42,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
