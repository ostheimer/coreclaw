import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import type { AgentOutput, Task, Message, Session, PromptVersion, PromptMetrics } from "./types.js";
import type { Draft, DraftStatus, Correction } from "./approval/types.js";

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
  [
    2,
    `
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source_message_id TEXT,
      channel TEXT NOT NULL DEFAULT 'email',
      "to" TEXT NOT NULL DEFAULT '[]',
      cc TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      original_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'rejected', 'sent', 'edited_and_sent', 'auto_approved')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      conductor_notes TEXT,
      quality_score REAL,
      quality_notes TEXT,
      auto_approve_match TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      sent_at TEXT,
      external_draft_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts (status);
    CREATE INDEX IF NOT EXISTS idx_drafts_task_id ON drafts (task_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_priority ON drafts (priority, created_at);

    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      original_body TEXT NOT NULL,
      edited_body TEXT NOT NULL,
      edited_subject TEXT,
      change_type TEXT NOT NULL DEFAULT 'minor_edit'
        CHECK (change_type IN ('minor_edit', 'major_rewrite', 'tone_change', 'factual_fix', 'rejection')),
      feedback TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (draft_id) REFERENCES drafts (id)
    );

    CREATE INDEX IF NOT EXISTS idx_corrections_draft_id ON corrections (draft_id);
    CREATE INDEX IF NOT EXISTS idx_corrections_task_id ON corrections (task_id);

    CREATE TABLE IF NOT EXISTS approval_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      conditions TEXT NOT NULL DEFAULT '[]',
      action TEXT NOT NULL DEFAULT 'auto_approve'
        CHECK (action IN ('auto_approve', 'flag_review', 'escalate')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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

// ---------- Draft Repository ----------

export const draftRepo = {
  insert(draft: Omit<Draft, "createdAt" | "updatedAt">): Draft {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO drafts (id, task_id, source_message_id, channel, "to", cc, subject, body, original_body, status, priority, conductor_notes, quality_score, quality_notes, auto_approve_match, reviewed_by, reviewed_at, sent_at, external_draft_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.taskId,
      draft.sourceMessageId ?? null,
      draft.channel,
      JSON.stringify(draft.to),
      JSON.stringify(draft.cc),
      draft.subject,
      draft.body,
      draft.originalBody,
      draft.status,
      draft.priority,
      draft.conductorNotes ?? null,
      draft.qualityScore ?? null,
      draft.qualityNotes ?? null,
      draft.autoApproveMatch ?? null,
      draft.reviewedBy ?? null,
      draft.reviewedAt?.toISOString() ?? null,
      draft.sentAt?.toISOString() ?? null,
      draft.externalDraftId ?? null,
      JSON.stringify(draft.metadata),
      now,
      now,
    );
    return this.findById(draft.id)!;
  },

  findById(id: string): Draft | null {
    const row = getDb().prepare("SELECT * FROM drafts WHERE id = ?").get(id);
    return row ? rowToDraft(row as unknown as DraftRow) : null;
  },

  findByStatus(status: DraftStatus, limit = 50): Draft[] {
    const rows = getDb()
      .prepare(`SELECT * FROM drafts WHERE status = ? ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at ASC LIMIT ?`)
      .all(status, limit);
    return (rows as unknown as DraftRow[]).map(rowToDraft);
  },

  findPendingReview(limit = 50): Draft[] {
    return this.findByStatus("pending_review", limit);
  },

  findByTaskId(taskId: string): Draft | null {
    const row = getDb().prepare("SELECT * FROM drafts WHERE task_id = ?").get(taskId);
    return row ? rowToDraft(row as unknown as DraftRow) : null;
  },

  updateStatus(id: string, status: DraftStatus, reviewedBy?: string): void {
    const reviewedAt = ["approved", "rejected", "edited_and_sent"].includes(status)
      ? new Date().toISOString()
      : null;
    const sentAt = ["sent", "edited_and_sent", "auto_approved"].includes(status)
      ? new Date().toISOString()
      : null;
    getDb().prepare(`
      UPDATE drafts SET status = ?, reviewed_by = COALESCE(?, reviewed_by), reviewed_at = COALESCE(?, reviewed_at), sent_at = COALESCE(?, sent_at), updated_at = datetime('now') WHERE id = ?
    `).run(status, reviewedBy ?? null, reviewedAt, sentAt, id);
  },

  updateBody(id: string, body: string, subject?: string): void {
    if (subject !== undefined) {
      getDb().prepare("UPDATE drafts SET body = ?, subject = ?, updated_at = datetime('now') WHERE id = ?").run(body, subject, id);
    } else {
      getDb().prepare("UPDATE drafts SET body = ?, updated_at = datetime('now') WHERE id = ?").run(body, id);
    }
  },

  updateQuality(id: string, score: number, notes: string): void {
    getDb().prepare("UPDATE drafts SET quality_score = ?, quality_notes = ?, updated_at = datetime('now') WHERE id = ?").run(score, notes, id);
  },

  countByStatus(): Record<string, number> {
    const rows = getDb().prepare("SELECT status, COUNT(*) as count FROM drafts GROUP BY status").all() as Array<{ status: string; count: number }>;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = r.count;
    return counts;
  },

  findRecent(limit = 50): Draft[] {
    const rows = getDb()
      .prepare("SELECT * FROM drafts ORDER BY created_at DESC LIMIT ?")
      .all(limit);
    return (rows as unknown as DraftRow[]).map(rowToDraft);
  },
};

// ---------- Correction Repository ----------

export const correctionRepo = {
  insert(correction: Omit<Correction, "createdAt">): Correction {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO corrections (id, draft_id, task_id, original_body, edited_body, edited_subject, change_type, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      correction.id,
      correction.draftId,
      correction.taskId,
      correction.originalBody,
      correction.editedBody,
      correction.editedSubject ?? null,
      correction.changeType,
      correction.feedback ?? null,
      now,
    );
    return this.findById(correction.id)!;
  },

  findById(id: string): Correction | null {
    const row = getDb().prepare("SELECT * FROM corrections WHERE id = ?").get(id);
    return row ? rowToCorrection(row as unknown as CorrectionRow) : null;
  },

  findByDraftId(draftId: string): Correction[] {
    const rows = getDb().prepare("SELECT * FROM corrections WHERE draft_id = ? ORDER BY created_at ASC").all(draftId);
    return (rows as unknown as CorrectionRow[]).map(rowToCorrection);
  },

  findRecent(limit = 50): Correction[] {
    const rows = getDb().prepare("SELECT * FROM corrections ORDER BY created_at DESC LIMIT ?").all(limit);
    return (rows as unknown as CorrectionRow[]).map(rowToCorrection);
  },

  countToday(): number {
    const row = getDb().prepare("SELECT COUNT(*) as count FROM corrections WHERE created_at >= date('now')").get() as { count: number } | undefined;
    return row?.count ?? 0;
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

interface DraftRow {
  id: string;
  task_id: string;
  source_message_id: string | null;
  channel: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  original_body: string;
  status: string;
  priority: string;
  conductor_notes: string | null;
  quality_score: number | null;
  quality_notes: string | null;
  auto_approve_match: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  external_draft_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

interface CorrectionRow {
  id: string;
  draft_id: string;
  task_id: string;
  original_body: string;
  edited_body: string;
  edited_subject: string | null;
  change_type: string;
  feedback: string | null;
  created_at: string;
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

function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    taskId: row.task_id,
    sourceMessageId: row.source_message_id,
    channel: row.channel,
    to: JSON.parse(row.to) as string[],
    cc: JSON.parse(row.cc) as string[],
    subject: row.subject,
    body: row.body,
    originalBody: row.original_body,
    status: row.status as DraftStatus,
    priority: row.priority as Draft["priority"],
    conductorNotes: row.conductor_notes,
    qualityScore: row.quality_score,
    qualityNotes: row.quality_notes,
    autoApproveMatch: row.auto_approve_match,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    externalDraftId: row.external_draft_id,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToCorrection(row: CorrectionRow): Correction {
  return {
    id: row.id,
    draftId: row.draft_id,
    taskId: row.task_id,
    originalBody: row.original_body,
    editedBody: row.edited_body,
    editedSubject: row.edited_subject,
    changeType: row.change_type as Correction["changeType"],
    feedback: row.feedback,
    createdAt: new Date(row.created_at),
  };
}

