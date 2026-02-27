import "dotenv/config";
import { TaskQueue } from "./queue.js";
import { runInContainer } from "./container-runner.js";
import { taskRepo } from "./db.js";
import { ipcBus } from "./ipc.js";
import { startServer } from "./server.js";
import {
  ChiefConductor,
  InboxConductor,
  QualityConductor,
  WorkflowConductor,
  ContextConductor,
  LearningConductor,
} from "./conductors/index.js";
import type { Task } from "./types.js";
import { EmailConfigStore } from "./channels/email/config-store.js";
import { EmailSync } from "./channels/email/sync.js";

// ---------- Setup ----------

const queue = new TaskQueue({ concurrency: 3, retryDelay: 5_000 });

const conductors = [
  new ChiefConductor(),
  new InboxConductor(),
  new QualityConductor(),
  new WorkflowConductor(),
  new ContextConductor(),
  new LearningConductor(),
];

// ---------- Queue handler ----------

queue.setHandler(async (task: Task) => {
  console.log(`[host] Running task ${task.id} (${task.type})`);

  const result = await runInContainer(task);

  taskRepo.updateStatus(task.id, result.output.status === "failed" ? "failed" : "completed", result.output);

  if (result.output.status === "escalated") {
    ipcBus.publish("task:escalated", "host", { task, output: result.output });
  } else if (result.output.status === "failed") {
    ipcBus.publish("task:failed", "host", { task, output: result.output });
  } else {
    ipcBus.publish("task:completed", "host", { task, output: result.output });
  }
});

// ---------- Queue events ----------

queue.on("enqueued", (task: Task) => {
  console.log(`[queue] Enqueued task ${task.id} (${task.type}, ${task.priority})`);
});

queue.on("failed", (task: Task, err: Error) => {
  console.error(`[queue] Task ${task.id} permanently failed:`, err.message);
});

queue.on("retry", (task: Task, err: Error) => {
  console.warn(`[queue] Task ${task.id} retry ${task.retryCount}/${task.maxRetries}:`, err.message);
});

// ---------- IPC: route newly created tasks to queue ----------

ipcBus.subscribe<{ task: Task; routed?: boolean }>("task:created", (event) => {
  const { task, routed } = event.payload;
  if (routed) {
    queue.enqueue(task);
  }
});

// ---------- Startup & shutdown ----------

let httpServer: ReturnType<typeof startServer> | null = null;

async function start(): Promise<void> {
  console.log("[CoreClaw] Starting...");

  for (const conductor of conductors) {
    await conductor.start();
  }

  const pending = taskRepo.findPending(50);
  for (const task of pending) {
    queue.enqueue(task);
  }

  httpServer = startServer();

  // Auto-start email sync if configured
  const emailConfig = new EmailConfigStore().load();
  if (emailConfig?.mailbox) {
    try {
      const sync = new EmailSync(emailConfig);
      await sync.start();
      console.log(`[CoreClaw] Email sync started for ${emailConfig.mailbox}`);
    } catch (err) {
      console.warn("[CoreClaw] Email sync auto-start failed:", err);
    }
  }

  console.log(`[CoreClaw] Started. Queue: ${queue.size} pending, ${queue.activeCount} running`);
}

async function shutdown(): Promise<void> {
  console.log("[CoreClaw] Shutting down...");
  queue.pause();

  if (httpServer) {
    httpServer.close();
  }

  for (const conductor of conductors) {
    await conductor.stop();
  }

  console.log("[CoreClaw] Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.on("uncaughtException", (err) => {
  console.error("[CoreClaw] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[CoreClaw] Unhandled rejection:", reason);
});

void start();
