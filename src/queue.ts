import { EventEmitter } from "events";
import type { Task, TaskPriority } from "./types.js";
import { taskRepo } from "./db.js";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export interface QueueOptions {
  concurrency?: number;
  retryDelay?: number;
}

type TaskHandler = (task: Task) => Promise<void>;

export class TaskQueue extends EventEmitter {
  private readonly concurrency: number;
  private readonly retryDelayMs: number;
  private running = 0;
  private paused = false;
  private readonly waiting: Task[] = [];
  private handler: TaskHandler | null = null;

  constructor(options: QueueOptions = {}) {
    super();
    this.concurrency = options.concurrency ?? 3;
    this.retryDelayMs = options.retryDelay ?? 5_000;
  }

  setHandler(handler: TaskHandler): void {
    this.handler = handler;
  }

  enqueue(task: Task): void {
    taskRepo.updateStatus(task.id, "queued");
    this.waiting.push(task);
    this.sortWaiting();
    this.emit("enqueued", task);
    this.drain();
  }

  pause(): void {
    this.paused = true;
    this.emit("paused");
  }

  resume(): void {
    this.paused = false;
    this.emit("resumed");
    this.drain();
  }

  get size(): number {
    return this.waiting.length;
  }

  get activeCount(): number {
    return this.running;
  }

  private sortWaiting(): void {
    this.waiting.sort((a, b) => {
      const pDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private drain(): void {
    if (this.paused) return;
    if (!this.handler) return;

    while (this.running < this.concurrency && this.waiting.length > 0) {
      const task = this.waiting.shift()!;
      this.running++;
      this.processTask(task);
    }
  }

  private processTask(task: Task): void {
    if (!this.handler) return;

    taskRepo.updateStatus(task.id, "running");
    this.emit("started", task);

    const start = Date.now();
    this.handler(task)
      .then(() => {
        this.running--;
        this.emit("completed", task, Date.now() - start);
        this.drain();
      })
      .catch((err: unknown) => {
        this.running--;
        const error = err instanceof Error ? err : new Error(String(err));

        if (task.retryCount < task.maxRetries) {
          taskRepo.incrementRetry(task.id);
          taskRepo.updateStatus(task.id, "pending");
          this.emit("retry", task, error);
          setTimeout(() => {
            const refreshed = taskRepo.findById(task.id);
            if (refreshed) this.enqueue(refreshed);
          }, this.retryDelayMs * (task.retryCount + 1));
        } else {
          taskRepo.updateStatus(task.id, "failed");
          this.emit("failed", task, error);
        }

        this.drain();
      });
  }
}
