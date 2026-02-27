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
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;

    if (channel === "webhook") {
      return { category: "api-request", priority: "normal", agentType: "webhook-handler", reason: "Webhook channel" };
    }

    // Manual input (call notes, case updates)
    if (channel === "manual") {
      const type = metadata["type"] as string | undefined;
      if (type === "call-note") {
        return { category: "call-note", priority: "normal", agentType: "case-agent", reason: "Manual call note" };
      }
      return { category: "manual-input", priority: "normal", agentType: "general-agent", reason: "Manual input" };
    }

    // Email-specific triage (M365/Exchange)
    if (channel === "email") {
      const importance = metadata["importance"] as string | undefined;
      const hasAttachments = metadata["hasAttachments"] as boolean | undefined;

      if (importance === "high" || subject.includes("dringend") || subject.includes("urgent") || subject.includes("critical")) {
        return { category: "urgent-email", priority: "urgent", agentType: "email-agent", reason: "High importance / urgent keywords" };
      }

      if (subject.includes("rechnung") || subject.includes("invoice") || subject.includes("billing") || subject.includes("zahlung") || subject.includes("payment")) {
        return { category: "billing-email", priority: "high", agentType: "billing-agent", reason: "Billing keywords (DE/EN)" };
      }

      if (subject.includes("fehler") || subject.includes("bug") || subject.includes("error") || subject.includes("problem") || body.includes("funktioniert nicht")) {
        return { category: "bug-report", priority: "high", agentType: "support-agent", reason: "Bug/error keywords (DE/EN)" };
      }

      if (subject.includes("kündigung") || subject.includes("cancellation") || subject.includes("beschwerde") || subject.includes("complaint")) {
        return { category: "escalation", priority: "urgent", agentType: "escalation-agent", reason: "Cancellation/complaint keywords" };
      }

      if (hasAttachments && (subject.includes("vertrag") || subject.includes("contract") || subject.includes("angebot") || subject.includes("offer"))) {
        return { category: "contract-email", priority: "high", agentType: "document-agent", reason: "Contract/offer with attachments" };
      }

      if (subject.includes("re:") || subject.includes("aw:")) {
        return { category: "email-reply", priority: "normal", agentType: "email-agent", reason: "Reply in existing thread" };
      }

      return { category: "general-email", priority: "normal", agentType: "email-agent", reason: "Standard email" };
    }

    if (subject.includes("urgent") || subject.includes("critical") || body.includes("outage")) {
      return { category: "urgent-support", priority: "urgent", agentType: "support-agent", reason: "Urgent keywords" };
    }

    if (channel === "teams" || channel === "slack") {
      return { category: "chat-message", priority: "normal", agentType: "chat-agent", reason: "Chat channel" };
    }

    return { category: "general", priority: "low", agentType: "general-agent", reason: "No specific category matched" };
  }
}
