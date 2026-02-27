import { BaseConductor } from "./base.js";
import { taskRepo } from "../db.js";
import { randomUUID } from "crypto";
import type { Message, Task } from "../types.js";
import type { IpcEvent } from "../ipc.js";

interface MessageReceivedPayload {
  message: Message;
}

interface TriageResult {
  category: string;
  priority: Task["priority"];
  agentType: string;
  reason: string;
}

/**
 * Inbox Conductor — host-level triage logic.
 * Categorizes incoming messages and routes them to the right task type.
 * Intentionally rule-based (no container) for determinism and speed.
 */
export class InboxConductor extends BaseConductor {
  constructor() {
    super("inbox");
  }

  protected registerSubscriptions(): void {
    this.on<MessageReceivedPayload>("message:received", (event) => {
      void this.handleIncomingMessage(event);
    });
  }

  private async handleIncomingMessage(event: IpcEvent<MessageReceivedPayload>): Promise<void> {
    const { message } = event.payload;
    const start = Date.now();

    const triage = this.triage(message);

    const task: Omit<Task, "createdAt" | "updatedAt" | "completedAt"> = {
      id: randomUUID(),
      type: triage.agentType,
      status: "pending",
      priority: triage.priority,
      payload: {
        messageId: message.id,
        category: triage.category,
        triageReason: triage.reason,
      },
      sourceChannel: message.channel,
      sourceMessageId: message.id,
      agentId: null,
      conductorId: "inbox",
      result: null,
      retryCount: 0,
      maxRetries: 3,
    };

    const created = taskRepo.insert(task);

    this.publish("task:created", { task: created, triage }, "workflow");

    console.log(
      `[inbox] Message ${message.id} → task ${created.id} (${triage.category}, ${triage.priority}) in ${Date.now() - start}ms`,
    );
  }

  /**
   * Rule-based triage. Business rules live here and in conductors/inbox/rules.md.
   * Can be extended with LLM-based triage as a future enhancement.
   */
  private triage(message: Message): TriageResult {
    const subject = (message.subject ?? "").toLowerCase();
    const body = message.body.toLowerCase();
    const channel = message.channel;

    if (channel === "webhook") {
      return { category: "api-request", priority: "normal", agentType: "webhook-handler", reason: "Webhook channel" };
    }

    if (subject.includes("urgent") || subject.includes("critical") || body.includes("outage")) {
      return { category: "urgent-support", priority: "urgent", agentType: "support-agent", reason: "Urgent keywords" };
    }

    if (subject.includes("invoice") || subject.includes("billing") || subject.includes("payment")) {
      return { category: "billing", priority: "high", agentType: "billing-agent", reason: "Billing keywords" };
    }

    if (subject.includes("bug") || subject.includes("error") || subject.includes("broken")) {
      return { category: "bug-report", priority: "high", agentType: "support-agent", reason: "Bug report keywords" };
    }

    if (channel === "email") {
      return { category: "general-email", priority: "normal", agentType: "email-agent", reason: "Standard email" };
    }

    if (channel === "teams" || channel === "slack") {
      return { category: "chat-message", priority: "normal", agentType: "chat-agent", reason: "Chat channel" };
    }

    return { category: "general", priority: "low", agentType: "general-agent", reason: "No specific category matched" };
  }
}
