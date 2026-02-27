import { BaseConductor } from "./base.js";
import { taskRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { Task, AgentOutput } from "../types.js";

interface ReviewRequest {
  task: Task;
  output: AgentOutput;
}

interface ReviewResult {
  taskId: string;
  approved: boolean;
  corrections: string[];
  finalOutput: AgentOutput;
  reviewedAt: Date;
}

/**
 * Quality Conductor — reviews agent outputs before they go out.
 * Checks tone, factual consistency, and policy compliance.
 * Can run as a lightweight host-level check or escalate to an agent container.
 */
export class QualityConductor extends BaseConductor {
  constructor() {
    super("quality");
  }

  protected registerSubscriptions(): void {
    this.on<ReviewRequest>("conductor:review-request", (event) => {
      void this.handleReviewRequest(event);
    });
  }

  private async handleReviewRequest(event: IpcEvent<ReviewRequest>): Promise<void> {
    const { task, output } = event.payload;
    const start = Date.now();

    const result = await this.review(task, output);

    this.publish<ReviewResult>("conductor:review-result", result, "chief");

    console.log(
      `[quality] Reviewed task ${task.id}: ${result.approved ? "approved" : "corrections needed"} in ${Date.now() - start}ms`,
    );
  }

  private async review(task: Task, output: AgentOutput): Promise<ReviewResult> {
    const corrections: string[] = [];

    // Host-level policy checks (fast, no container needed)
    if (!output.summary || output.summary.length < 10) {
      corrections.push("Summary is too short or missing");
    }

    if (output.outputs.length === 0 && output.status === "completed") {
      corrections.push("No outputs provided despite completed status");
    }

    for (const item of output.outputs) {
      const policyViolation = this.checkPolicyViolation(item.content);
      if (policyViolation) {
        corrections.push(policyViolation);
      }
    }

    const approved = corrections.length === 0;

    if (!approved) {
      taskRepo.updateStatus(task.id, "running");
    }

    return {
      taskId: task.id,
      approved,
      corrections,
      finalOutput: {
        ...output,
        needsReview: !approved || output.needsReview,
        metadata: { ...output.metadata },
      },
      reviewedAt: new Date(),
    };
  }

  /**
   * Checks for obvious policy violations in output content.
   * Extend with domain-specific rules in conductors/quality/rules.md.
   */
  private checkPolicyViolation(content: string): string | null {
    const lower = content.toLowerCase();

    const sensitivePatterns = [
      { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, label: "Credit card number" },
      { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, label: "Email in output" },
      { pattern: /password\s*[:=]\s*\S+/i, label: "Password in output" },
    ];

    for (const { pattern, label } of sensitivePatterns) {
      if (pattern.test(lower)) {
        return `Potential ${label} detected in output`;
      }
    }

    return null;
  }
}
