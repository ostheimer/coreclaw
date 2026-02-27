import { BaseConductor } from "./base.js";
import { taskRepo, promptRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { Task, AgentOutput, PromptMetrics } from "../types.js";

interface ReviewResult {
  taskId: string;
  approved: boolean;
  corrections: string[];
  finalOutput: AgentOutput;
  reviewedAt: Date;
}

interface FeedbackPayload {
  taskId: string;
  rating: "positive" | "negative" | "neutral";
  comment?: string;
}

/**
 * Learning Conductor — analyzes feedback, tracks patterns,
 * and suggests prompt improvements over time.
 */
export class LearningConductor extends BaseConductor {
  constructor() {
    super("learning");
  }

  protected registerSubscriptions(): void {
    this.on<ReviewResult>("conductor:review-result", (event) => {
      void this.handleReviewResult(event);
    });

    this.on<FeedbackPayload>("conductor:feedback", (event) => {
      void this.handleFeedback(event);
    });
  }

  private async handleReviewResult(event: IpcEvent<ReviewResult>): Promise<void> {
    const { taskId, approved, corrections } = event.payload;

    if (!approved && corrections.length > 0) {
      console.log(`[learning] Task ${taskId} had ${corrections.length} corrections — tracking for prompt improvement`);
      this.trackCorrectionPattern(taskId, corrections);
    }
  }

  private async handleFeedback(event: IpcEvent<FeedbackPayload>): Promise<void> {
    const { taskId, rating, comment } = event.payload;
    const task = taskRepo.findById(taskId);
    if (!task) return;

    const note = comment ? ` — "${comment}"` : "";
    console.log(`[learning] Feedback for task ${taskId}: ${rating}${note}`);

    if (rating === "negative") {
      await this.analyzeLowQualityOutput(task);
    }
  }

  private trackCorrectionPattern(taskId: string, corrections: string[]): void {
    console.log(`[learning] Correction patterns for task ${taskId}:`, corrections);
  }

  private async analyzeLowQualityOutput(task: Task): Promise<void> {
    console.log(`[learning] Analyzing low-quality output for task ${task.id} (type: ${task.type})`);

    if (task.type) {
      const promptName = `${task.type}-system-prompt`;
      const active = promptRepo.findActive(promptName);
      if (active) {
        const current = active.metrics ?? this.emptyMetrics();
        const updated: PromptMetrics = {
          ...current,
          usageCount: current.usageCount + 1,
          negativeRating: current.negativeRating + 1,
        };
        promptRepo.updateMetrics(active.id, updated);
      }
    }
  }

  private emptyMetrics(): PromptMetrics {
    return {
      usageCount: 0,
      positiveRating: 0,
      negativeRating: 0,
      avgDuration_ms: 0,
      correctionRate: 0,
    };
  }
}
