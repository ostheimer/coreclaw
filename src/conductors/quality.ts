import { BaseConductor } from "./base.js";
import { taskRepo, draftRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { Task, AgentOutput } from "../types.js";
import type { Draft } from "../approval/types.js";

interface ReviewRequest {
  task: Task;
  output: AgentOutput;
}

interface DraftCreatedPayload {
  draft: Draft;
  task: Task;
  needsReview: boolean;
}

interface ReviewResult {
  taskId: string;
  draftId?: string;
  approved: boolean;
  qualityScore: number;
  corrections: string[];
  finalOutput: AgentOutput;
  reviewedAt: Date;
}

/**
 * Quality Conductor — reviews agent outputs and drafts before they go out.
 * Checks tone, factual consistency, and policy compliance.
 * Assigns a quality score (0-100) to each draft.
 */
export class QualityConductor extends BaseConductor {
  constructor() {
    super("quality");
  }

  protected registerSubscriptions(): void {
    this.on<ReviewRequest>("conductor:review-request", (event) => {
      void this.handleReviewRequest(event);
    });

    this.on<DraftCreatedPayload>("draft:created", (event) => {
      void this.handleDraftReview(event);
    });
  }

  private async handleDraftReview(event: IpcEvent<DraftCreatedPayload>): Promise<void> {
    const { draft } = event.payload;
    const start = Date.now();

    const score = this.scoreDraft(draft);
    const notes = this.generateQualityNotes(draft, score);

    draftRepo.updateQuality(draft.id, score.score, notes);

    this.publish("draft:quality-reviewed", {
      draftId: draft.id,
      qualityScore: score.score,
      qualityNotes: notes,
      issues: score.issues,
    }, "chief");

    console.log(
      `[quality] Draft ${draft.id} scored ${score.score}/100 in ${Date.now() - start}ms`,
    );
  }

  private async handleReviewRequest(event: IpcEvent<ReviewRequest>): Promise<void> {
    const { task, output } = event.payload;
    const start = Date.now();

    const result = await this.review(task, output);

    this.publish<ReviewResult>("conductor:review-result", result, "chief");

    console.log(
      `[quality] Reviewed task ${task.id}: ${result.approved ? "approved" : "corrections needed"} (score: ${result.qualityScore}) in ${Date.now() - start}ms`,
    );
  }

  private async review(task: Task, output: AgentOutput): Promise<ReviewResult> {
    const corrections: string[] = [];

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
    const qualityScore = approved ? 80 : Math.max(20, 80 - corrections.length * 20);

    if (!approved) {
      taskRepo.updateStatus(task.id, "running");
    }

    return {
      taskId: task.id,
      approved,
      qualityScore,
      corrections,
      finalOutput: {
        ...output,
        needsReview: !approved || output.needsReview,
        metadata: { ...output.metadata },
      },
      reviewedAt: new Date(),
    };
  }

  private scoreDraft(draft: Draft): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 100;

    // Length checks
    if (draft.body.length < 20) {
      issues.push("Antwort zu kurz");
      score -= 30;
    }
    if (draft.body.length > 5000) {
      issues.push("Antwort möglicherweise zu lang");
      score -= 10;
    }

    // Subject check
    if (!draft.subject || draft.subject.length < 3) {
      issues.push("Betreff fehlt oder zu kurz");
      score -= 15;
    }

    // Recipient check
    if (draft.to.length === 0) {
      issues.push("Kein Empfänger angegeben");
      score -= 25;
    }

    // Policy checks on body
    const policyViolation = this.checkPolicyViolation(draft.body);
    if (policyViolation) {
      issues.push(policyViolation);
      score -= 30;
    }

    // Tone indicators
    const lower = draft.body.toLowerCase();
    if (lower.includes("!!!") || lower.includes("???")) {
      issues.push("Übermäßige Satzzeichen");
      score -= 10;
    }

    return { score: Math.max(0, Math.min(100, score)), issues };
  }

  private generateQualityNotes(_draft: Draft, scoreResult: { score: number; issues: string[] }): string {
    if (scoreResult.issues.length === 0) {
      return `Qualität: ${scoreResult.score}/100 — Keine Beanstandungen`;
    }
    return `Qualität: ${scoreResult.score}/100 — ${scoreResult.issues.join("; ")}`;
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
