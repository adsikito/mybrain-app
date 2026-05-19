import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export type TaskStatus = 'pending' | 'frozen' | 'completed';

export type TaskRecord = {
  id: string;
  title: string;
  status: TaskStatus;
  quadrant: number;
  parent_split_id: string | null;
  frozen_reason: string | null;
  payload_json: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  scheduled_start_at: number | null;
  scheduled_end_at: number | null;
};

export type TaskEventType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'frozen'
  | 'completed'
  | 'scheduled';

export type TaskInput = {
  id: string;
  title: string;
  status?: TaskStatus;
  quadrant?: number;
  parentSplitId?: string | null;
  frozenReason?: string | null;
  scheduledStartAt?: number | null;
  scheduledEndAt?: number | null;
  payload?: Record<string, unknown>;
};

export type TaskStatusPatch = {
  status: TaskStatus;
  frozenReason?: string | null;
  completedAt?: number | null;
  payload?: Record<string, unknown>;
};

export type TaskSchedulePatch = {
  taskId: string;
  scheduledStartAt: number | null;
  scheduledEndAt: number | null;
  payload?: Record<string, unknown>;
};

export type TaskPlanOperation =
  | {
      kind: 'upsert';
      task: TaskInput;
    }
  | {
      kind: 'patch';
      taskId: string;
      patch: TaskStatusPatch;
    }
  | {
      kind: 'schedule';
      patch: TaskSchedulePatch;
    };

export type TaskTransactionPlan = {
  id: string;
  title: string;
  sourceText: string;
  operations: TaskPlanOperation[];
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

function normalizeQuadrant(quadrant: number | undefined) {
  if (quadrant === 1 || quadrant === 2 || quadrant === 3 || quadrant === 4) {
    return quadrant;
  }

  return 1;
}

function normalizeTaskStatus(status: string): TaskStatus {
  if ((TASK_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as TaskStatus;
  }

  return 'pending';
}

async function ensureColumn(db: SQLiteDatabase, columns: { name: string }[], name: string, sql: string) {
  if (!columns.some((column) => column.name === name)) {
    await db.execAsync(sql);
  }
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
          quadrant INTEGER NOT NULL DEFAULT 1,
          parent_split_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
          frozen_reason TEXT,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER,
          scheduled_start_at INTEGER,
          scheduled_end_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status_updated_at
          ON tasks(status, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_tasks_parent_split_id
          ON tasks(parent_split_id);

        CREATE INDEX IF NOT EXISTS idx_tasks_quadrant_status_updated_at
          ON tasks(quadrant, status, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_tasks_schedule
          ON tasks(scheduled_start_at, scheduled_end_at);

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

      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(tasks)`);
      await ensureColumn(db, columns, 'quadrant', `ALTER TABLE tasks ADD COLUMN quadrant INTEGER NOT NULL DEFAULT 1;`);
      await ensureColumn(db, columns, 'scheduled_start_at', `ALTER TABLE tasks ADD COLUMN scheduled_start_at INTEGER;`);
      await ensureColumn(db, columns, 'scheduled_end_at', `ALTER TABLE tasks ADD COLUMN scheduled_end_at INTEGER;`);
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

const TASK_SELECT = `
  SELECT
    id,
    title,
    status,
    quadrant,
    parent_split_id,
    frozen_reason,
    payload_json,
    created_at,
    updated_at,
    completed_at,
    scheduled_start_at,
    scheduled_end_at
  FROM tasks
`;

export async function listTasks(limit = 50): Promise<TaskRecord[]> {
  const db = await getMyBrainDatabase();
  return db.getAllAsync<TaskRecord>(
    `
      ${TASK_SELECT}
      ORDER BY updated_at DESC
      LIMIT $limit
    `,
    { $limit: limit },
  );
}

export async function listScheduledTasks(dayStart: number, dayEnd: number): Promise<TaskRecord[]> {
  const db = await getMyBrainDatabase();
  return db.getAllAsync<TaskRecord>(
    `
      ${TASK_SELECT}
      WHERE scheduled_start_at IS NOT NULL
        AND scheduled_end_at IS NOT NULL
        AND scheduled_start_at < $day_end
        AND scheduled_end_at > $day_start
      ORDER BY scheduled_start_at ASC
    `,
    { $day_start: dayStart, $day_end: dayEnd },
  );
}

export async function getTaskById(id: string): Promise<TaskRecord | null> {
  const db = await getMyBrainDatabase();
  return getTaskByIdWithDb(db, id);
}

async function getTaskByIdWithDb(db: SQLiteDatabase, id: string): Promise<TaskRecord | null> {
  return db.getFirstAsync<TaskRecord>(
    `
      ${TASK_SELECT}
      WHERE id = $id
      LIMIT 1
    `,
    { $id: id },
  );
}

export async function upsertTask(input: TaskInput): Promise<TaskRecord> {
  const db = await getMyBrainDatabase();
  return upsertTaskWithDb(db, input);
}

async function upsertTaskWithDb(db: SQLiteDatabase, input: TaskInput): Promise<TaskRecord> {
  const timestamp = now();
  const status = input.status ?? 'pending';
  const quadrant = normalizeQuadrant(input.quadrant);
  const completedAt = status === 'completed' ? timestamp : null;

  await db.runAsync(
    `
      INSERT INTO tasks (
        id,
        title,
        status,
        quadrant,
        parent_split_id,
        frozen_reason,
        payload_json,
        created_at,
        updated_at,
        completed_at,
        scheduled_start_at,
        scheduled_end_at
      )
      VALUES (
        $id,
        $title,
        $status,
        $quadrant,
        $parent_split_id,
        $frozen_reason,
        $payload_json,
        $created_at,
        $updated_at,
        $completed_at,
        $scheduled_start_at,
        $scheduled_end_at
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        quadrant = excluded.quadrant,
        parent_split_id = excluded.parent_split_id,
        frozen_reason = excluded.frozen_reason,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at,
        scheduled_start_at = excluded.scheduled_start_at,
        scheduled_end_at = excluded.scheduled_end_at
    `,
    {
      $id: input.id,
      $title: input.title,
      $status: status,
      $quadrant: quadrant,
      $parent_split_id: input.parentSplitId ?? null,
      $frozen_reason: input.frozenReason ?? null,
      $payload_json: toJson(input.payload),
      $created_at: timestamp,
      $updated_at: timestamp,
      $completed_at: completedAt,
      $scheduled_start_at: input.scheduledStartAt ?? null,
      $scheduled_end_at: input.scheduledEndAt ?? null,
    },
  );

  await logTaskEventWithDb(db, input.id, status === 'pending' ? 'created' : 'updated', {
    title: input.title,
    status,
    quadrant,
    parentSplitId: input.parentSplitId ?? null,
    scheduledStartAt: input.scheduledStartAt ?? null,
    scheduledEndAt: input.scheduledEndAt ?? null,
  });

  const task = await getTaskByIdWithDb(db, input.id);
  if (!task) {
    throw new Error(`Failed to load task ${input.id} after write.`);
  }

  return task;
}

export async function setTaskStatus(taskId: string, patch: TaskStatusPatch): Promise<TaskRecord> {
  const db = await getMyBrainDatabase();
  return setTaskStatusWithDb(db, taskId, patch);
}

async function setTaskStatusWithDb(
  db: SQLiteDatabase,
  taskId: string,
  patch: TaskStatusPatch,
): Promise<TaskRecord> {
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

  await logTaskEventWithDb(
    db,
    taskId,
    patch.status === 'completed'
      ? 'completed'
      : patch.status === 'frozen'
        ? 'frozen'
        : 'status_changed',
    {
      status: patch.status,
      frozenReason,
      completedAt,
    },
  );

  const task = await getTaskByIdWithDb(db, taskId);
  if (!task) {
    throw new Error(`Task ${taskId} does not exist.`);
  }

  return task;
}

export async function scheduleTask(patch: TaskSchedulePatch): Promise<TaskRecord> {
  const db = await getMyBrainDatabase();
  return scheduleTaskWithDb(db, patch);
}

async function scheduleTaskWithDb(db: SQLiteDatabase, patch: TaskSchedulePatch): Promise<TaskRecord> {
  const timestamp = now();

  await db.runAsync(
    `
      UPDATE tasks
      SET
        scheduled_start_at = $scheduled_start_at,
        scheduled_end_at = $scheduled_end_at,
        payload_json = $payload_json,
        updated_at = $updated_at
      WHERE id = $id
    `,
    {
      $id: patch.taskId,
      $scheduled_start_at: patch.scheduledStartAt,
      $scheduled_end_at: patch.scheduledEndAt,
      $payload_json: toJson(patch.payload),
      $updated_at: timestamp,
    },
  );

  await logTaskEventWithDb(db, patch.taskId, 'scheduled', {
    scheduledStartAt: patch.scheduledStartAt,
    scheduledEndAt: patch.scheduledEndAt,
  });

  const task = await getTaskByIdWithDb(db, patch.taskId);
  if (!task) {
    throw new Error(`Task ${patch.taskId} does not exist.`);
  }

  return task;
}

async function logTaskEventWithDb(
  db: SQLiteDatabase,
  taskId: string,
  eventType: TaskEventType,
  payload: Record<string, unknown>,
) {
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

export async function listPendingTasksByQuadrant(quadrant: number) {
  const db = await getMyBrainDatabase();
  return db.getAllAsync<TaskRecord>(
    `
      ${TASK_SELECT}
      WHERE quadrant = $quadrant AND status = 'pending'
      ORDER BY updated_at DESC
    `,
    { $quadrant: normalizeQuadrant(quadrant) },
  );
}

export async function listTasksByStatus(status: TaskStatus) {
  const db = await getMyBrainDatabase();
  return db.getAllAsync<TaskRecord>(
    `
      ${TASK_SELECT}
      WHERE status = $status
      ORDER BY updated_at DESC
    `,
    { $status: status },
  );
}

export async function countTasks() {
  const db = await getMyBrainDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM tasks
    `,
  );
  return result?.count ?? 0;
}

const DEMO_TASKS: TaskInput[] = [
  {
    id: 'demo-q1-focus',
    title: '\u5904\u7406\u4eca\u5929\u53d1\u5e03\u524d\u7684\u963b\u585e\u95ee\u9898',
    quadrant: 1,
    status: 'pending',
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q1-ship',
    title: '\u786e\u8ba4\u52a9\u7406\u4e8b\u52a1\u5361\u7247\u5199\u5165\u94fe\u8def',
    quadrant: 1,
    status: 'pending',
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q2-flow',
    title: '\u6253\u78e8\u56db\u8c61\u9650\u653e\u5927\u4e0e\u6536\u6298\u4f53\u9a8c',
    quadrant: 2,
    status: 'pending',
    scheduledStartAt: new Date().setHours(10, 30, 0, 0),
    scheduledEndAt: new Date().setHours(11, 20, 0, 0),
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q2-polish',
    title: '\u5fae\u8c03\u4efb\u52a1\u5361\u7247\u6ed1\u52a8\u624b\u611f',
    quadrant: 2,
    status: 'pending',
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q3-admin',
    title: '\u68c0\u67e5\u8bbe\u7f6e\u9875\u9690\u79c1\u7535\u95f8',
    quadrant: 3,
    status: 'pending',
    scheduledStartAt: new Date().setHours(14, 0, 0, 0),
    scheduledEndAt: new Date().setHours(14, 30, 0, 0),
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q3-db',
    title: '\u5ba1\u8ba1\u672c\u5730 SQLite \u4e8b\u4ef6\u6d41',
    quadrant: 3,
    status: 'pending',
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q4-calm',
    title: '\u6e05\u7406\u4f4e\u4ef7\u503c\u5f85\u529e\u5165\u53e3',
    quadrant: 4,
    status: 'pending',
    payload: { source: 'demo' },
  },
  {
    id: 'demo-q4-capture',
    title: '\u6574\u7406\u672c\u8f6e\u8fed\u4ee3\u8bb0\u5f55',
    quadrant: 4,
    status: 'pending',
    payload: { source: 'demo' },
  },
];

export async function ensureDemoTasks() {
  if ((await countTasks()) > 0) {
    return;
  }

  for (const task of DEMO_TASKS) {
    await upsertTask(task);
  }
}

export async function applyTaskTransaction(plan: TaskTransactionPlan) {
  const db = await getMyBrainDatabase();

  await db.withTransactionAsync(async () => {
    for (const operation of plan.operations) {
      if (operation.kind === 'upsert') {
        await upsertTaskWithDb(db, operation.task);
      } else if (operation.kind === 'patch') {
        await setTaskStatusWithDb(db, operation.taskId, operation.patch);
      } else {
        await scheduleTaskWithDb(db, operation.patch);
      }
    }
  });
}

export async function checkpointWal() {
  const db = await getMyBrainDatabase();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}
