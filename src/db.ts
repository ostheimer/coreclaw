import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import type { AgentOutput, Task, Message, Session, PromptVersion, PromptMetrics } from "./types.js";

const DB_PATH = process.env["DB_PATH"] ?? path.join(process.cwd(), "data", "coreclaw.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    const inMemory = DB_PATH === ":memory:";
    if (!inMemory) {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ---------- Transaction helper ----------

function runInTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---------- Migration ----------

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as Array<{ version: number }>;
  const applied = new Set(rows.map((r) => r.version));

  for (const [version, sql] of MIGRATIONS) {
    if (!applied.has(version)) {
      runInTransaction(db, () => {
        db.exec(sql);
        db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      });
      console.log(`[DB] Applied migration v${version}`);
    }
  }
}

const MIGRATIONS: Array<[number, string]> = [
  [
    1,
    `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      external_id TEXT,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processing', 'handled', 'failed')),
      task_id TEXT,
      thread_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status);
    CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages (thread_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      payload TEXT NOT NULL DEFAULT '{}',
      source_channel TEXT,
      source_message_id TEXT,
      agent_id TEXT,
      conductor_id TEXT,
      result TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'starting'
        CHECK (status IN ('starting', 'running', 'stopped', 'error')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      stopped_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks (id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON sessions (task_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      session_id TEXT,
      rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative', 'neutral')),
      comment TEXT,
      prompt_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks (id)
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      activated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metrics TEXT,
      UNIQUE (name, version)
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_versions_name ON prompt_versions (name, active);
    `,
  ],
];

// ---------- Message Repository ----------

export const messageRepo = {
  insert(msg: Omit<Message, "createdAt" | "updatedAt">): Message {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO messages (id, channel, direction, external_id, sender, recipient, subject, body, metadata, status, task_id, thread_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id,
      msg.channel,
      msg.direction,
      msg.externalId ?? null,
      msg.from,
      JSON.stringify(msg.to),
      msg.subject ?? null,
      msg.body,
      JSON.stringify(msg.metadata),
      msg.status,
      msg.taskId ?? null,
      msg.threadId ?? null,
      now,
      now,
    );
    return this.findById(msg.id)!;
  },

  findById(id: string): Message | null {
    const row = getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id);
    return row ? rowToMessage(row as unknown as MessageRow) : null;
  },

  findByStatus(status: Message["status"], limit = 50): Message[] {
    const rows = getDb()
      .prepare("SELECT * FROM messages WHERE status = ? ORDER BY created_at ASC LIMIT ?")
      .all(status, limit);
    return (rows as unknown as MessageRow[]).map(rowToMessage);
  },

  updateStatus(id: string, status: Message["status"], taskId?: string): void {
    getDb().prepare(`
      UPDATE messages SET status = ?, task_id = COALESCE(?, task_id), updated_at = datetime('now') WHERE id = ?
    `).run(status, taskId ?? null, id);
  },
};

// ---------- Task Repository ----------

export const taskRepo = {
  insert(task: Omit<Task, "createdAt" | "updatedAt" | "completedAt">): Task {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO tasks (id, type, status, priority, payload, source_channel, source_message_id, agent_id, conductor_id, result, retry_count, max_retries, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.type,
      task.status,
      task.priority,
      JSON.stringify(task.payload),
      task.sourceChannel ?? null,
      task.sourceMessageId ?? null,
      task.agentId ?? null,
      task.conductorId ?? null,
      task.result ? JSON.stringify(task.result) : null,
      task.retryCount,
      task.maxRetries,
      now,
      now,
    );
    return this.findById(task.id)!;
  },

  findById(id: string): Task | null {
    const row = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return row ? rowToTask(row as unknown as TaskRow) : null;
  },

  findByStatus(status: Task["status"], limit = 100): Task[] {
    const rows = getDb()
      .prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC LIMIT ?")
      .all(status, limit);
    return (rows as unknown as TaskRow[]).map(rowToTask);
  },

  findPending(limit = 20): Task[] {
    const rows = getDb().prepare(`
      SELECT * FROM tasks
      WHERE status IN ('pending', 'queued')
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT ?
    `).all(limit);
    return (rows as unknown as TaskRow[]).map(rowToTask);
  },

  updateStatus(id: string, status: Task["status"], result?: AgentOutput): void {
    const completedAt = ["completed", "failed", "cancelled"].includes(status)
      ? new Date().toISOString()
      : null;
    getDb().prepare(`
      UPDATE tasks SET status = ?, result = COALESCE(?, result), completed_at = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, result ? JSON.stringify(result) : null, completedAt, id);
  },

  incrementRetry(id: string): void {
    getDb().prepare(`
      UPDATE tasks SET retry_count = retry_count + 1, updated_at = datetime('now') WHERE id = ?
    `).run(id);
  },
};

// ---------- Session Repository ----------

export const sessionRepo = {
  insert(session: Omit<Session, "startedAt" | "stoppedAt">): Session {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO sessions (id, agent_id, task_id, container_id, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(session.id, session.agentId, session.taskId, session.containerId ?? null, session.status, now);
    return this.findById(session.id)!;
  },

  findById(id: string): Session | null {
    const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return row ? rowToSession(row as unknown as SessionRow) : null;
  },

  findByTaskId(taskId: string): Session[] {
    const rows = getDb().prepare("SELECT * FROM sessions WHERE task_id = ? ORDER BY started_at ASC").all(taskId);
    return (rows as unknown as SessionRow[]).map(rowToSession);
  },

  updateStatus(id: string, status: Session["status"], containerId?: string): void {
    const stoppedAt = ["stopped", "error"].includes(status) ? new Date().toISOString() : null;
    getDb().prepare(`
      UPDATE sessions SET status = ?, container_id = COALESCE(?, container_id), stopped_at = ? WHERE id = ?
    `).run(status, containerId ?? null, stoppedAt, id);
  },
};

// ---------- Prompt Version Repository ----------

export const promptRepo = {
  insert(prompt: Omit<PromptVersion, "createdAt" | "activatedAt" | "metrics">): PromptVersion {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO prompt_versions (id, name, content, version, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(prompt.id, prompt.name, prompt.content, prompt.version, prompt.active ? 1 : 0, now);
    return this.findById(prompt.id)!;
  },

  findById(id: string): PromptVersion | null {
    const row = getDb().prepare("SELECT * FROM prompt_versions WHERE id = ?").get(id);
    return row ? rowToPrompt(row as unknown as PromptRow) : null;
  },

  findActive(name: string): PromptVersion | null {
    const row = getDb().prepare("SELECT * FROM prompt_versions WHERE name = ? AND active = 1").get(name);
    return row ? rowToPrompt(row as unknown as PromptRow) : null;
  },

  activate(id: string): void {
    const prompt = this.findById(id);
    if (!prompt) throw new Error(`Prompt ${id} not found`);
    const db = getDb();
    runInTransaction(db, () => {
      db.prepare("UPDATE prompt_versions SET active = 0 WHERE name = ?").run(prompt.name);
      db.prepare("UPDATE prompt_versions SET active = 1, activated_at = datetime('now') WHERE id = ?").run(id);
    });
  },

  updateMetrics(id: string, metrics: PromptMetrics): void {
    getDb().prepare("UPDATE prompt_versions SET metrics = ? WHERE id = ?").run(JSON.stringify(metrics), id);
  },
};

// ---------- Row types (node:sqlite returns null-prototype objects) ----------

interface MessageRow {
  id: string;
  channel: string;
  direction: string;
  external_id: string | null;
  sender: string;
  recipient: string;
  subject: string | null;
  body: string;
  metadata: string;
  status: string;
  task_id: string | null;
  thread_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  type: string;
  status: string;
  priority: string;
  payload: string;
  source_channel: string | null;
  source_message_id: string | null;
  agent_id: string | null;
  conductor_id: string | null;
  result: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface SessionRow {
  id: string;
  agent_id: string;
  task_id: string;
  container_id: string | null;
  status: string;
  started_at: string;
  stopped_at: string | null;
}

interface PromptRow {
  id: string;
  name: string;
  content: string;
  version: number;
  active: number;
  activated_at: string | null;
  created_at: string;
  metrics: string | null;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction as Message["direction"],
    externalId: row.external_id,
    from: row.sender,
    to: JSON.parse(row.recipient) as string[],
    subject: row.subject,
    body: row.body,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    status: row.status as Message["status"],
    taskId: row.task_id,
    threadId: row.thread_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    type: row.type,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    sourceChannel: row.source_channel,
    sourceMessageId: row.source_message_id,
    agentId: row.agent_id,
    conductorId: row.conductor_id,
    result: row.result ? (JSON.parse(row.result) as AgentOutput) : null,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    agentId: row.agent_id,
    taskId: row.task_id,
    containerId: row.container_id,
    status: row.status as Session["status"],
    startedAt: new Date(row.started_at),
    stoppedAt: row.stopped_at ? new Date(row.stopped_at) : null,
  };
}

function rowToPrompt(row: PromptRow): PromptVersion {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    version: row.version,
    active: row.active === 1,
    activatedAt: row.activated_at ? new Date(row.activated_at) : null,
    createdAt: new Date(row.created_at),
    metrics: row.metrics ? (JSON.parse(row.metrics) as PromptMetrics) : null,
  };
}

