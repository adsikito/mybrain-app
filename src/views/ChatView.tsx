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
import * as SecureStore from 'expo-secure-store';

import type { TaskInput, TaskTransactionPlan } from '../../database';
import { CARD_SURFACE_STYLE } from '../components/cardSurface';
import {
  API_BASE_URL_STORAGE_KEY,
  API_KEY_STORAGE_KEY,
  DEFAULT_API_BASE_URL,
  DEFAULT_MODEL_NAME,
  MODEL_NAME_STORAGE_KEY,
} from './SettingsView';

type PlanStatus = 'draft' | 'submitting' | 'submitted' | 'error';
type ChatSendState = 'idle' | 'sending';

type ChatMessage =
  | {
      id: string;
      kind: 'text';
      role: 'assistant' | 'user';
      text: string;
    }
  | {
      id: string;
      kind: 'warning';
      role: 'assistant';
      title: string;
      errorText: string;
      sourceText: string;
    }
  | {
      id: string;
      kind: 'plan';
      role: 'assistant';
      plan: TaskTransactionPlan;
      status: PlanStatus;
      errorMessage?: string;
    };

type AiTaskItem = {
  title: string;
  quadrant?: number;
  durationMinutes?: number;
};

type AiTaskResponse = {
  tasks?: AiTaskItem[];
};

export interface ChatViewProps {
  onSubmitPlan: (plan: TaskTransactionPlan) => Promise<void>;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'hello',
    kind: 'text',
    role: 'assistant',
    text: '我会先向你配置的模型请求拆解建议，只生成事务确认卡。你点下确认后，我才写入本地 SQLite。',
  },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function shorten(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function normalizeQuadrant(value: number | undefined) {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  return 2;
}

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?/u, '').replace(/```$/u, '').trim();
}

function parseAiTaskResponse(content: string): AiTaskItem[] {
  const parsed = JSON.parse(stripJsonFence(content)) as AiTaskResponse | AiTaskItem[];
  const rawTasks = Array.isArray(parsed) ? parsed : parsed.tasks;

  if (!Array.isArray(rawTasks)) {
    throw new Error('模型没有返回 tasks 数组。');
  }

  const tasks = rawTasks
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title.trim() : '',
      quadrant: normalizeQuadrant(item.quadrant),
      durationMinutes:
        typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes)
          ? Math.max(5, Math.min(240, Math.round(item.durationMinutes)))
          : 25,
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 8);

  if (tasks.length === 0) {
    throw new Error('模型返回了空任务列表。');
  }

  return tasks;
}

function buildTransactionPlan(sourceText: string, aiTasks: AiTaskItem[]): TaskTransactionPlan {
  const planId = `chat-plan-${Date.now()}`;
  const parentId = `${planId}-parent`;
  const parentTask: TaskInput = {
    id: parentId,
    title: shorten(sourceText, 42),
    status: 'pending',
    quadrant: 2,
    payload: { source: 'chat', mode: 'ai_decomposition', sourceText },
  };

  return {
    id: planId,
    title: 'AI 拆解建议',
    sourceText,
    operations: [
      { kind: 'upsert', task: parentTask },
      ...aiTasks.map((item, index) => ({
        kind: 'upsert' as const,
        task: {
          id: `${planId}-item-${index + 1}`,
          title: shorten(item.title, 58),
          status: 'pending' as const,
          quadrant: normalizeQuadrant(item.quadrant),
          parentSplitId: parentId,
          payload: {
            source: 'chat',
            mode: 'ai_decomposition',
            sourceText,
            durationMinutes: item.durationMinutes ?? 25,
            index: index + 1,
          },
        },
      })),
    ],
  };
}

async function readModelConfig() {
  const [apiKey, apiBaseUrl, modelName] = await Promise.all([
    SecureStore.getItemAsync(API_KEY_STORAGE_KEY),
    SecureStore.getItemAsync(API_BASE_URL_STORAGE_KEY),
    SecureStore.getItemAsync(MODEL_NAME_STORAGE_KEY),
  ]);

  return {
    apiKey: apiKey?.trim() ?? '',
    apiBaseUrl: (apiBaseUrl?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/u, ''),
    modelName: modelName?.trim() || DEFAULT_MODEL_NAME,
  };
}

async function requestAiTasks(sourceText: string) {
  const { apiKey, apiBaseUrl, modelName } = await readModelConfig();

  if (!apiKey) {
    throw new Error('请先在设置页保存 API Key。');
  }

  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是 MyBrain AI 的任务拆解器。只返回 JSON，不要 Markdown。格式必须是 {"tasks":[{"title":"中文子任务","quadrant":1|2|3|4,"durationMinutes":25}]}。quadrant 代表四象限：1重要紧急，2重要不紧急，3紧急不重要，4不重要不紧急。任务标题必须是简洁中文动词短句。',
        },
        {
          role: 'user',
          content: sourceText,
        },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `模型请求失败：${response.status}`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('模型响应缺少 message.content。');
  }

  return parseAiTaskResponse(content);
}

function getPlanStatusLabel(status: PlanStatus) {
  if (status === 'submitting') {
    return '写入中';
  }
  if (status === 'submitted') {
    return '已导入';
  }
  if (status === 'error') {
    return '失败';
  }

  return '待确认';
}

export function ChatView({ onSubmitPlan }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const [sendState, setSendState] = useState<ChatSendState>('idle');
  const canSend = draft.trim().length > 0 && sendState === 'idle';

  const appendMessage = (message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  };

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
      appendMessage({
        id: makeId('assistant'),
        kind: 'text',
        role: 'assistant',
        text: '已按你的确认安全导入本地 SQLite。',
      });
    } catch (error) {
      console.error('[ChatView] 确认导入失败', error);
      updatePlanStatus(id, 'error', error instanceof Error ? error.message : '导入失败');
    }
  };

  const sendMessage = async (sourceText?: string, options?: { echoUser?: boolean }) => {
    const text = (sourceText ?? draft).trim();
    if (!text || sendState === 'sending') {
      return;
    }

    if (sourceText === undefined) {
      setDraft('');
    }

    setSendState('sending');
    if (options?.echoUser !== false) {
      appendMessage({ id: makeId('user'), kind: 'text', role: 'user', text });
    }

    try {
      const aiTasks = await requestAiTasks(text);
      const plan = buildTransactionPlan(text, aiTasks);
      appendMessage({ id: makeId('plan'), kind: 'plan', role: 'assistant', plan, status: 'draft' });
    } catch (error) {
      console.error('[ChatView] 请求模型失败', error);
      appendMessage({
        id: makeId('warning'),
        kind: 'warning',
        role: 'assistant',
        title: '网络暂时不可用',
        errorText: error instanceof Error ? error.message : '中转网关或模型接口返回了未知错误，请稍后重试。',
        sourceText: text,
      });
    } finally {
      setSendState('idle');
    }
  };

  const footer = useMemo(
    () => (
      <View style={styles.composer}>
        <TextInput
          placeholder="例如：帮我把写论文拆解一下"
          placeholderTextColor="#8E8E93"
          value={draft}
          onChangeText={setDraft}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!canSend}
          onPress={() => void sendMessage()}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>{sendState === 'sending' ? '思考中' : '发送'}</Text>
        </Pressable>
      </View>
    ),
    [canSend, draft, sendMessage, sendState],
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>助理</Text>
        <Text style={styles.title}>先确认，再写入</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'warning') {
            return (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>{item.title}</Text>
                <Text style={styles.warningBody}>{item.errorText}</Text>
                <Text style={styles.warningHint}>你可以稍后重新发送同一条拆解请求。</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void sendMessage(item.sourceText, { echoUser: false })}
                  style={styles.warningButton}
                >
                  <Text style={styles.warningButtonText}>重新发送</Text>
                </Pressable>
              </View>
            );
          }

          if (item.kind === 'plan') {
            return (
              <View style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleBlock}>
                    <Text style={styles.planTitle}>{item.plan.title}</Text>
                    <Text style={styles.planSubtitle}>事务确认卡</Text>
                  </View>
                  <Text style={styles.planStatus}>{getPlanStatusLabel(item.status)}</Text>
                </View>
                <Text style={styles.planText}>{item.plan.sourceText}</Text>
                <View style={styles.operationBox}>
                  <Text style={styles.operationLabel}>确认后将写入</Text>
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
                  onPress={() => void confirmPlan(item.id, item.plan)}
                  style={[
                    styles.confirmButton,
                    (item.status === 'submitting' || item.status === 'submitted') && styles.confirmButtonDisabled,
                  ]}
                >
                  <Text style={styles.confirmText}>确认并导入本地</Text>
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
  warningCard: {
    ...CARD_SURFACE_STYLE,
    backgroundColor: '#FFF5F5',
    borderColor: '#FFB4B4',
    padding: 14,
    gap: 10,
  },
  warningTitle: {
    color: '#B00020',
    fontSize: 16,
    fontWeight: '800',
  },
  warningBody: {
    color: '#7A1525',
    fontSize: 14,
    lineHeight: 20,
  },
  warningHint: {
    color: '#B36B74',
    fontSize: 12,
    lineHeight: 17,
  },
  warningButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B00020',
    marginTop: 2,
  },
  warningButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  planCard: {
    ...CARD_SURFACE_STYLE,
    padding: 14,
    gap: 12,
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
