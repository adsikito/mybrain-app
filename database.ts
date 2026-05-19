import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export type TaskStatus = 'pending' | 'frozen' | 'completed';

export type TaskRecord = {
  id: string;
  title: string;
  status: TaskStatus;
  parent_split_id: string | null;
  frozen_reason: string | null;
  payload_json: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

export type TaskEventType = 'created' | 'updated' | 'status_changed' | 'frozen' | 'completed';

export type TaskInput = {
  id: string;
  title: string;
  status?: TaskStatus;
  parentSplitId?: string | null;
  frozenReason?: string | null;
  payload?: Record<string, unknown>;
};

export type TaskStatusPatch = {
  status: TaskStatus;
  frozenReason?: string | null;
  completedAt?: number | null;
  payload?: Record<string, unknown>;
};

const DATABASE_NAME = 'mybrain_local.db';

const TASK_STATUS_VALUES: readonly TaskStatus[] = ['pending', 'frozen', 'completed'] as const;

let databasePromise: Promise<SQLiteDatabase> | null = null;
let bootstrapPromise: Promise<void> | null = null;

function now() {
  return Date.now();
}

function toJson(payload: Record<string, unknown> | undefined) {
  return JSON.stringify(payload ?? {});
}

function normalizeTaskStatus(status: string): TaskStatus {
  if ((TASK_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as TaskStatus;
  }
  return 'pending';
}

async function bootstrapDatabase(db: SQLiteDatabase) {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'frozen', 'completed')),
          parent_split_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
          frozen_reason TEXT,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status_updated_at
          ON tasks(status, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_tasks_parent_split_id
          ON tasks(parent_split_id);

        CREATE TABLE IF NOT EXISTS task_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_events_task_id_created_at
          ON task_events(task_id, created_at DESC);
      `);
    })();
  }

  return bootstrapPromise;
}

export async function getMyBrainDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME);
  }

  const db = await databasePromise;
  await bootstrapDatabase(db);
  return db;
}

export async function initializeMyBrainDatabase() {
  return getMyBrainDatabase();
}

export async function listTasks(limit = 50): Promise<TaskRecord[]> {
  const db = await getMyBrainDatabase();
  return db.getAllAsync<TaskRecord>(
    `
      SELECT
        id,
        title,
        status,
        parent_split_id,
        frozen_reason,
        payload_json,
        created_at,
        updated_at,
        completed_at
      FROM tasks
      ORDER BY updated_at DESC
      LIMIT $limit
    `,
    { $limit: limit },
  );
}

export async function getTaskById(id: string): Promise<TaskRecord | null> {
  const db = await getMyBrainDatabase();
  return db.getFirstAsync<TaskRecord>(
    `
      SELECT
        id,
        title,
        status,
        parent_split_id,
        frozen_reason,
        payload_json,
        created_at,
        updated_at,
        completed_at
      FROM tasks
      WHERE id = $id
      LIMIT 1
    `,
    { $id: id },
  );
}

export async function upsertTask(input: TaskInput): Promise<TaskRecord> {
  const db = await getMyBrainDatabase();
  const timestamp = now();
  const status = input.status ?? 'pending';

  await db.runAsync(
    `
      INSERT INTO tasks (
        id,
        title,
        status,
        parent_split_id,
        frozen_reason,
        payload_json,
        created_at,
        updated_at,
        completed_at
      )
      VALUES (
        $id,
        $title,
        $status,
        $parent_split_id,
        $frozen_reason,
        $payload_json,
        $created_at,
        $updated_at,
        $completed_at
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        parent_split_id = excluded.parent_split_id,
        frozen_reason = excluded.frozen_reason,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `,
    {
      $id: input.id,
      $title: input.title,
      $status: status,
      $parent_split_id: input.parentSplitId ?? null,
      $frozen_reason: input.frozenReason ?? null,
      $payload_json: toJson(input.payload),
      $created_at: timestamp,
      $updated_at: timestamp,
      $completed_at: status === 'completed' ? timestamp : null,
    },
  );

  await logTaskEvent(input.id, status === 'pending' ? 'created' : 'updated', {
    title: input.title,
    status,
    parentSplitId: input.parentSplitId ?? null,
  });

  const task = await getTaskById(input.id);
  if (!task) {
    throw new Error(`Failed to load task ${input.id} after write.`);
  }

  return task;
}

export async function setTaskStatus(taskId: string, patch: TaskStatusPatch): Promise<TaskRecord> {
  const db = await getMyBrainDatabase();
  const timestamp = now();
  const completedAt = patch.status === 'completed' ? patch.completedAt ?? timestamp : null;
  const frozenReason = patch.status === 'frozen' ? patch.frozenReason ?? null : null;

  await db.runAsync(
    `
      UPDATE tasks
      SET
        status = $status,
        frozen_reason = $frozen_reason,
        payload_json = $payload_json,
        updated_at = $updated_at,
        completed_at = $completed_at
      WHERE id = $id
    `,
    {
      $id: taskId,
      $status: patch.status,
      $frozen_reason: frozenReason,
      $payload_json: toJson(patch.payload),
      $updated_at: timestamp,
      $completed_at: completedAt,
    },
  );

  await logTaskEvent(taskId, patch.status === 'completed' ? 'completed' : patch.status === 'frozen' ? 'frozen' : 'status_changed', {
    status: patch.status,
    frozenReason,
    completedAt,
  });

  const task = await getTaskById(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} does not exist.`);
  }

  return task;
}

async function logTaskEvent(taskId: string, eventType: TaskEventType, payload: Record<string, unknown>) {
  const db = await getMyBrainDatabase();
  await db.runAsync(
    `
      INSERT INTO task_events (
        task_id,
        event_type,
        payload_json,
        created_at
      ) VALUES (
        $task_id,
        $event_type,
        $payload_json,
        $created_at
      )
    `,
    {
      $task_id: taskId,
      $event_type: eventType,
      $payload_json: toJson(payload),
      $created_at: now(),
    },
  );
}

export function coerceTaskStatus(value: string | null | undefined) {
  return normalizeTaskStatus(value ?? 'pending');
}
