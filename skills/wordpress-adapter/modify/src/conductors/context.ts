import { BaseConductor } from "./base.js";
import { messageRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { Task } from "../types.js";
import type { KnowledgeSource, KnowledgeRecord } from "../knowledge-sources/types.js";
import { WordPressSource } from "../knowledge-sources/wordpress.js";

interface TaskCreatedPayload {
  task: Task;
}

interface ContextPayload {
  taskId: string;
  threadHistory: Array<{ from: string; body: string; timestamp: string }>;
  relevantDocs: Array<{ id: string; content: string; score: number }>;
  customerData: Record<string, unknown> | null;
  knowledgeRecords: KnowledgeRecord[];
}

/**
 * Context Conductor — retrieval layer for knowledge management.
 * Fetches past conversations, customer data, and relevant documents
 * to inject context into agent tasks.
 * Supports pluggable knowledge sources (WordPress, CRM, etc.).
 */
export class ContextConductor extends BaseConductor {
  private readonly knowledgeSources: KnowledgeSource[] = [];

  constructor() {
    super("context");

    if (process.env["WORDPRESS_URL"]) {
      this.knowledgeSources.push(new WordPressSource());
    }
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

    // Query knowledge sources for related information
    const knowledgeRecords = await this.queryKnowledgeSources(task);

    return {
      taskId: task.id,
      threadHistory,
      relevantDocs: [],
      customerData: null,
      knowledgeRecords,
    };
  }

  private async queryKnowledgeSources(task: Task): Promise<KnowledgeRecord[]> {
    const records: KnowledgeRecord[] = [];
    const caseRef = task.payload["caseRef"] as string | undefined;
    const query = caseRef ?? task.payload["messageId"] as string ?? "";

    for (const source of this.knowledgeSources) {
      try {
        const related = await source.getRelated(query, { limit: 5 });
        records.push(...related);
      } catch (err) {
        console.warn(`[context] Knowledge source "${source.name}" failed:`, err);
      }
    }

    return records;
  }
}
