import { BaseConductor } from "./base.js";
import { taskRepo, promptRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { AgentOutput, PromptMetrics } from "../types.js";
import { updatePromptMetrics, analyzeCorrections, generatePromptSuggestions } from "../learning/analyzer.js";
import type { LearningInsight, PromptSuggestion } from "../learning/analyzer.js";

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

interface CorrectionRecordedPayload {
  draftId: string;
  taskId: string;
  changeType: string;
  originalLength: number;
  editedLength: number;
}

/**
 * Learning Conductor — analyzes corrections and feedback,
 * detects patterns, and suggests prompt improvements.
 *
 * Listens to: correction:recorded, conductor:review-result, conductor:feedback
 * Publishes: conductor:learning-insight
 */
export class LearningConductor extends BaseConductor {
  private correctionBuffer: CorrectionRecordedPayload[] = [];
  private analysisTimer: ReturnType<typeof setInterval> | null = null;
  private lastInsights: LearningInsight[] = [];
  private lastSuggestions: PromptSuggestion[] = [];

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

    this.on<CorrectionRecordedPayload>("correction:recorded", (event) => {
      this.handleCorrectionRecorded(event);
    });

    // Periodic analysis every 5 minutes
    this.analysisTimer = setInterval(() => {
      void this.runPeriodicAnalysis();
    }, 5 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    await super.stop();
  }

  getInsights(): LearningInsight[] {
    return this.lastInsights;
  }

  getSuggestions(): PromptSuggestion[] {
    return this.lastSuggestions;
  }

  // ---------- Event Handlers ----------

  private handleCorrectionRecorded(event: IpcEvent<CorrectionRecordedPayload>): void {
    const { taskId, changeType } = event.payload;
    this.correctionBuffer.push(event.payload);

    console.log(`[learning] Correction recorded for task ${taskId} (${changeType})`);

    // Update prompt metrics for the agent type
    const task = taskRepo.findById(taskId);
    if (task) {
      updatePromptMetrics(task.type);
    }

    // Trigger analysis if enough corrections accumulated
    if (this.correctionBuffer.length >= 5) {
      void this.runAnalysis();
    }
  }

  private async handleReviewResult(event: IpcEvent<ReviewResult>): Promise<void> {
    const { taskId, approved, corrections } = event.payload;

    if (!approved && corrections.length > 0) {
      console.log(`[learning] Task ${taskId} had ${corrections.length} quality corrections`);
    }
  }

  private async handleFeedback(event: IpcEvent<FeedbackPayload>): Promise<void> {
    const { taskId, rating, comment } = event.payload;
    const task = taskRepo.findById(taskId);
    if (!task) return;

    const note = comment ? ` — "${comment}"` : "";
    console.log(`[learning] Feedback for task ${taskId}: ${rating}${note}`);

    if (task.type) {
      const promptName = `${task.type}-system-prompt`;
      const active = promptRepo.findActive(promptName);
      if (active) {
        const current = active.metrics ?? this.emptyMetrics();
        const updated: PromptMetrics = {
          ...current,
          usageCount: current.usageCount + 1,
          positiveRating: current.positiveRating + (rating === "positive" ? 1 : 0),
          negativeRating: current.negativeRating + (rating === "negative" ? 1 : 0),
        };
        promptRepo.updateMetrics(active.id, updated);
      }
    }
  }

  // ---------- Analysis ----------

  private async runAnalysis(): Promise<void> {
    this.correctionBuffer = [];

    this.lastInsights = analyzeCorrections();
    this.lastSuggestions = generatePromptSuggestions();

    if (this.lastSuggestions.length > 0) {
      console.log(`[learning] ${this.lastSuggestions.length} prompt improvement suggestion(s) generated`);

      this.publish("conductor:learning-insight", {
        insights: this.lastInsights,
        suggestions: this.lastSuggestions,
        timestamp: new Date().toISOString(),
      }, "chief");
    }
  }

  private async runPeriodicAnalysis(): Promise<void> {
    await this.runAnalysis();
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
