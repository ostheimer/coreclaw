/**
 * Tests for the database layer (SQLite repositories).
 * These tests use an in-memory database to avoid side effects.
 */
import { randomUUID } from "crypto";

// Override DB path before importing db module
process.env["DB_PATH"] = ":memory:";

import { getDb, closeDb, messageRepo, taskRepo, sessionRepo, promptRepo } from "../db.js";
import type { Message, Task } from "../types.js";

describe("DB: Migration", () => {
  afterAll(() => closeDb());

  it("creates required tables", () => {
    const db = getDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tables = rows.map((r) => r.name);

    expect(tables).toContain("messages");
    expect(tables).toContain("tasks");
    expect(tables).toContain("sessions");
    expect(tables).toContain("feedback");
    expect(tables).toContain("prompt_versions");
    expect(tables).toContain("schema_migrations");
  });

  it("applies migration v1 exactly once", () => {
    const rows = getDb()
      .prepare("SELECT version FROM schema_migrations")
      .all() as Array<{ version: number }>;
    const versions = rows.map((r) => r.version);
    expect(versions).toContain(1);
    expect(versions.filter((v) => v === 1)).toHaveLength(1);
  });
});

describe("messageRepo", () => {
  const makeMsg = (overrides?: Partial<Omit<Message, "createdAt" | "updatedAt">>): Omit<Message, "createdAt" | "updatedAt"> => ({
    id: randomUUID(),
    channel: "email",
    direction: "inbound",
    externalId: null,
    from: "sender@example.com",
    to: ["receiver@example.com"],
    subject: "Test Subject",
    body: "Test body",
    metadata: {},
    status: "new",
    taskId: null,
    threadId: null,
    ...overrides,
  });

  it("inserts and retrieves a message", () => {
    const msg = messageRepo.insert(makeMsg());
    expect(msg.id).toBeDefined();
    const found = messageRepo.findById(msg.id);
    expect(found).not.toBeNull();
    expect(found!.from).toBe("sender@example.com");
    expect(found!.to).toEqual(["receiver@example.com"]);
  });

  it("finds messages by status", () => {
    const id = randomUUID();
    messageRepo.insert(makeMsg({ id, status: "new" }));
    const found = messageRepo.findByStatus("new");
    expect(found.some((m) => m.id === id)).toBe(true);
  });

  it("updates message status", () => {
    const msg = messageRepo.insert(makeMsg());
    messageRepo.updateStatus(msg.id, "processing");
    const updated = messageRepo.findById(msg.id);
    expect(updated!.status).toBe("processing");
  });

  it("stores and parses metadata as JSON", () => {
    const msg = messageRepo.insert(makeMsg({ metadata: { source: "gmail", labels: ["inbox"] } }));
    const found = messageRepo.findById(msg.id);
    expect(found!.metadata).toEqual({ source: "gmail", labels: ["inbox"] });
  });
});

describe("taskRepo", () => {
  const makeTask = (overrides?: Partial<Omit<Task, "createdAt" | "updatedAt" | "completedAt">>): Omit<Task, "createdAt" | "updatedAt" | "completedAt"> => ({
    id: randomUUID(),
    type: "email-agent",
    status: "pending",
    priority: "normal",
    payload: { messageId: randomUUID() },
    sourceChannel: "email",
    sourceMessageId: null,
    agentId: null,
    conductorId: "inbox",
    result: null,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  });

  it("inserts and retrieves a task", () => {
    const task = taskRepo.insert(makeTask());
    const found = taskRepo.findById(task.id);
    expect(found).not.toBeNull();
    expect(found!.type).toBe("email-agent");
  });

  it("finds pending tasks sorted by priority", () => {
    const low = taskRepo.insert(makeTask({ priority: "low" }));
    const urgent = taskRepo.insert(makeTask({ priority: "urgent" }));
    const normal = taskRepo.insert(makeTask({ priority: "normal" }));

    const pending = taskRepo.findPending(10);
    const ids = pending.map((t) => t.id);

    expect(ids.indexOf(urgent.id)).toBeLessThan(ids.indexOf(normal.id));
    expect(ids.indexOf(normal.id)).toBeLessThan(ids.indexOf(low.id));
  });

  it("updates task status to completed", () => {
    const task = taskRepo.insert(makeTask());
    taskRepo.updateStatus(task.id, "completed", {
      status: "completed",
      priority: "normal",
      summary: "Done",
      needsReview: false,
      outputs: [],
      metadata: {},
    });
    const updated = taskRepo.findById(task.id);
    expect(updated!.status).toBe("completed");
    expect(updated!.completedAt).not.toBeNull();
  });

  it("increments retry count", () => {
    const task = taskRepo.insert(makeTask());
    taskRepo.incrementRetry(task.id);
    taskRepo.incrementRetry(task.id);
    const updated = taskRepo.findById(task.id);
    expect(updated!.retryCount).toBe(2);
  });
});

describe("sessionRepo", () => {
  it("inserts and retrieves a session", () => {
    const task = taskRepo.insert({
      id: randomUUID(),
      type: "email-agent",
      status: "running",
      priority: "normal",
      payload: {},
      sourceChannel: null,
      sourceMessageId: null,
      agentId: null,
      conductorId: null,
      result: null,
      retryCount: 0,
      maxRetries: 3,
    });

    const session = sessionRepo.insert({
      id: randomUUID(),
      agentId: "agent-1",
      taskId: task.id,
      containerId: null,
      status: "starting",
    });

    const found = sessionRepo.findById(session.id);
    expect(found).not.toBeNull();
    expect(found!.agentId).toBe("agent-1");
  });
});

describe("promptRepo", () => {
  it("inserts and activates a prompt version", () => {
    const id1 = randomUUID();
    const id2 = randomUUID();

    promptRepo.insert({ id: id1, name: "test-prompt", content: "v1 content", version: 1, active: false });
    promptRepo.insert({ id: id2, name: "test-prompt", content: "v2 content", version: 2, active: false });

    promptRepo.activate(id2);

    const active = promptRepo.findActive("test-prompt");
    expect(active).not.toBeNull();
    expect(active!.version).toBe(2);
    expect(active!.content).toBe("v2 content");
  });

  it("updates prompt metrics", () => {
    const id = randomUUID();
    promptRepo.insert({ id, name: "metrics-test", content: "content", version: 1, active: false });
    promptRepo.updateMetrics(id, {
      usageCount: 10,
      positiveRating: 8,
      negativeRating: 2,
      avgDuration_ms: 1500,
      correctionRate: 0.1,
    });

    const found = promptRepo.findById(id);
    expect(found!.metrics!.usageCount).toBe(10);
    expect(found!.metrics!.positiveRating).toBe(8);
  });
});
