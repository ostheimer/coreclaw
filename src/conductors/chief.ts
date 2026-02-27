import { BaseConductor } from "./base.js";
import { taskRepo } from "../db.js";
import type { IpcEvent } from "../ipc.js";
import type { Task, AgentOutput } from "../types.js";

interface TaskCompletedPayload {
  task: Task;
  output: AgentOutput;
}

interface StatusBriefing {
  timestamp: Date;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  needsReviewCount: number;
  escalations: Array<{ taskId: string; summary: string }>;
}

/**
 * Chief Conductor — aggregates status from all conductors, generates briefings,
 * and escalates to the human when needed.
 */
export class ChiefConductor extends BaseConductor {
  private briefingIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly briefingIntervalMs: number;

  constructor(briefingIntervalMs = 5 * 60 * 1_000) {
    super("chief");
    this.briefingIntervalMs = briefingIntervalMs;
  }

  async start(): Promise<void> {
    await super.start();
    this.briefingIntervalId = setInterval(() => {
      void this.generateBriefing();
    }, this.briefingIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.briefingIntervalId) {
      clearInterval(this.briefingIntervalId);
      this.briefingIntervalId = null;
    }
    await super.stop();
  }

  protected registerSubscriptions(): void {
    this.on<TaskCompletedPayload>("task:completed", (event) => {
      void this.handleTaskCompleted(event);
    });

    this.on<TaskCompletedPayload>("task:failed", (event) => {
      void this.handleTaskFailed(event);
    });

    this.on<TaskCompletedPayload>("task:escalated", (event) => {
      void this.handleEscalation(event);
    });
  }

  private async handleTaskCompleted(event: IpcEvent<TaskCompletedPayload>): Promise<void> {
    const { task, output } = event.payload;
    if (output.needsReview) {
      console.log(`[chief] Task ${task.id} needs review: ${output.summary}`);
      this.publish("conductor:review-request", { task, output }, "quality");
    }
  }

  private async handleTaskFailed(event: IpcEvent<TaskCompletedPayload>): Promise<void> {
    const { task } = event.payload;
    console.log(`[chief] Task ${task.id} failed — checking if escalation needed`);
  }

  private async handleEscalation(event: IpcEvent<TaskCompletedPayload>): Promise<void> {
    const { task, output } = event.payload;
    console.log(`[chief] ESCALATION: Task ${task.id} — ${output.summary}`);
    this.publish("conductor:briefing", {
      type: "escalation",
      task,
      output,
      timestamp: new Date(),
    });
  }

  async generateBriefing(): Promise<StatusBriefing> {
    const completed = taskRepo.findByStatus("completed", 1000);
    const failed = taskRepo.findByStatus("failed", 1000);
    const pending = taskRepo.findPending(100);
    const running = taskRepo.findByStatus("running", 100);

    const needsReview = completed.filter((t) => t.result?.needsReview).length;
    const escalations = completed
      .filter((t) => t.result?.status === "escalated")
      .map((t) => ({ taskId: t.id, summary: t.result?.summary ?? "" }));

    const briefing: StatusBriefing = {
      timestamp: new Date(),
      totalTasks: completed.length + failed.length + pending.length + running.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      pendingTasks: pending.length + running.length,
      needsReviewCount: needsReview,
      escalations,
    };

    this.publish("conductor:briefing", briefing);
    return briefing;
  }

  async getStatus(): Promise<StatusBriefing> {
    return this.generateBriefing();
  }
}
