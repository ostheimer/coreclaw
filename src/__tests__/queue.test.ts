/**
 * Tests for the task queue with concurrency, priority, and retry logic.
 */
import { randomUUID } from "crypto";
import { TaskQueue } from "../queue.js";
import type { Task } from "../types.js";

process.env["DB_PATH"] = ":memory:";

// Mock the db module to avoid SQLite in queue tests
jest.mock("../db.js", () => ({
  taskRepo: {
    updateStatus: jest.fn(),
    incrementRetry: jest.fn(),
    findById: jest.fn((id: string) => mockTasks.get(id) ?? null),
  },
}));

const mockTasks = new Map<string, Task>();

function makeTask(overrides?: Partial<Task>): Task {
  const id = randomUUID();
  const task: Task = {
    id,
    type: "test-agent",
    status: "pending",
    priority: "normal",
    payload: {},
    sourceChannel: null,
    sourceMessageId: null,
    agentId: null,
    conductorId: null,
    result: null,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
  mockTasks.set(id, task);
  return task;
}

describe("TaskQueue", () => {
  beforeEach(() => {
    mockTasks.clear();
    jest.clearAllMocks();
  });

  it("processes a task with a handler", async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const processed: string[] = [];

    queue.setHandler(async (task) => {
      processed.push(task.id);
    });

    const task = makeTask();
    queue.enqueue(task);

    await new Promise((resolve) => queue.once("completed", resolve));

    expect(processed).toContain(task.id);
  });

  it("respects concurrency limit", async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    let concurrent = 0;
    let maxConcurrent = 0;

    queue.setHandler(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
    });

    const tasks = Array.from({ length: 5 }, () => makeTask());
    for (const t of tasks) queue.enqueue(t);

    await new Promise<void>((resolve) => {
      let done = 0;
      queue.on("completed", () => {
        done++;
        if (done === tasks.length) resolve();
      });
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("retries failed tasks", async () => {
    const queue = new TaskQueue({ concurrency: 1, retryDelay: 0 });
    let attempts = 0;

    queue.setHandler(async () => {
      attempts++;
      if (attempts < 3) throw new Error("Simulated failure");
    });

    const task = makeTask({ maxRetries: 3 });
    // Update mock to reflect retry count on each retry
    const { taskRepo } = await import("../db.js");
    (taskRepo.findById as jest.Mock).mockImplementation((id: string) => {
      const t = mockTasks.get(id);
      if (!t) return null;
      return { ...t, retryCount: attempts - 1 };
    });

    queue.enqueue(task);

    await new Promise<void>((resolve) => {
      queue.on("completed", () => resolve());
      queue.on("failed", () => resolve());
    });

    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it("pauses and resumes processing", async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const processed: string[] = [];

    queue.setHandler(async (task) => {
      processed.push(task.id);
    });

    queue.pause();
    const task = makeTask();
    queue.enqueue(task);

    await new Promise((r) => setTimeout(r, 50));
    expect(processed).toHaveLength(0);

    queue.resume();
    await new Promise((resolve) => queue.once("completed", resolve));
    expect(processed).toContain(task.id);
  });

  it("emits events for lifecycle", async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const events: string[] = [];

    queue.setHandler(async () => {});
    queue.on("enqueued", () => events.push("enqueued"));
    queue.on("started", () => events.push("started"));
    queue.on("completed", () => events.push("completed"));

    queue.enqueue(makeTask());
    await new Promise((resolve) => queue.once("completed", resolve));

    expect(events).toContain("enqueued");
    expect(events).toContain("started");
    expect(events).toContain("completed");
  });
});
