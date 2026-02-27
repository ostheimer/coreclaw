import { BaseConductor } from "./base.js";
import { messageRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { Task } from "../types.js";

interface TaskCreatedPayload {
  task: Task;
}

interface ContextPayload {
  taskId: string;
  threadHistory: Array<{ from: string; body: string; timestamp: string }>;
  relevantDocs: Array<{ id: string; content: string; score: number }>;
  customerData: Record<string, unknown> | null;
}

/**
 * Context Conductor — retrieval layer for knowledge management.
 * Fetches past conversations, customer data, and relevant documents
 * to inject context into agent tasks.
 */
export class ContextConductor extends BaseConductor {
  constructor() {
    super("context");
  }

  protected registerSubscriptions(): void {
    this.on<TaskCreatedPayload>("task:created", (event) => {
      void this.enrichTaskContext(event);
    });
  }

  private async enrichTaskContext(event: IpcEvent<TaskCreatedPayload>): Promise<void> {
    const { task } = event.payload;

    if (!task.sourceMessageId) return;

    const context = await this.gatherContext(task);

    if (context) {
      this.publish("conductor:context-ready", context, "workflow");
    }
  }

  private async gatherContext(task: Task): Promise<ContextPayload | null> {
    const threadHistory: ContextPayload["threadHistory"] = [];

    if (task.sourceMessageId) {
      const sourceMessage = messageRepo.findById(task.sourceMessageId);
      if (sourceMessage?.threadId) {
        const thread = messageRepo.findByStatus("handled", 20);
        const related = thread.filter((m) => m.threadId === sourceMessage.threadId);
        for (const msg of related) {
          threadHistory.push({
            from: msg.from,
            body: msg.body.slice(0, 500),
            timestamp: msg.createdAt.toISOString(),
          });
        }
      }
    }

    return {
      taskId: task.id,
      threadHistory,
      relevantDocs: [],
      customerData: null,
    };
  }
}
