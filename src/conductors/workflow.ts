import { BaseConductor } from "./base.js";
import { taskRepo } from "../db.js";
import { randomUUID } from "crypto";
import type { IpcEvent } from "../ipc.js";
import type { Task } from "../types.js";

interface TaskCreatedPayload {
  task: Task;
  triage?: { category: string; priority: Task["priority"] };
}

interface WorkflowPlan {
  taskId: string;
  steps: WorkflowStep[];
  parallel: boolean;
}

interface WorkflowStep {
  id: string;
  type: string;
  order: number;
  dependsOn: string[];
  payload: Record<string, unknown>;
}

/**
 * Workflow Conductor — breaks complex tasks into steps, manages dependencies,
 * and merges results. Routes simple tasks directly to the queue.
 */
export class WorkflowConductor extends BaseConductor {
  constructor() {
    super("workflow");
  }

  protected registerSubscriptions(): void {
    this.on<TaskCreatedPayload>("task:created", (event) => {
      void this.handleTaskCreated(event);
    });
  }

  private async handleTaskCreated(event: IpcEvent<TaskCreatedPayload>): Promise<void> {
    const { task, triage } = event.payload;

    if (this.isComplexTask(task)) {
      const plan = this.planWorkflow(task);
      this.publish("conductor:workflow-planned", { task, plan }, "chief");
      await this.createSubTasks(task, plan);
      console.log(`[workflow] Planned ${plan.steps.length} steps for task ${task.id}`);
    } else {
      this.publish("task:created", { task, triage, routed: true });
      console.log(`[workflow] Simple task ${task.id} (${task.type}) → queue`);
    }
  }

  private isComplexTask(task: Task): boolean {
    const complexTypes = ["multi-step-response", "batch-processing", "research-and-report"];
    return complexTypes.includes(task.type);
  }

  private planWorkflow(task: Task): WorkflowPlan {
    const steps: WorkflowStep[] = [];

    switch (task.type) {
      case "research-and-report": {
        const researchId = randomUUID();
        const writeId = randomUUID();
        steps.push(
          { id: researchId, type: "research-agent", order: 1, dependsOn: [], payload: { parentTaskId: task.id } },
          { id: writeId, type: "report-agent", order: 2, dependsOn: [researchId], payload: { parentTaskId: task.id } },
        );
        return { taskId: task.id, steps, parallel: false };
      }

      case "batch-processing": {
        const items = (task.payload["items"] as unknown[]) ?? [];
        const batchSteps = items.map((item, i) => ({
          id: randomUUID(),
          type: "batch-item-agent",
          order: 1,
          dependsOn: [],
          payload: { parentTaskId: task.id, item, index: i },
        }));
        steps.push(...batchSteps);
        return { taskId: task.id, steps, parallel: true };
      }

      default:
        steps.push({
          id: randomUUID(),
          type: task.type,
          order: 1,
          dependsOn: [],
          payload: task.payload,
        });
        return { taskId: task.id, steps, parallel: false };
    }
  }

  private async createSubTasks(parentTask: Task, plan: WorkflowPlan): Promise<void> {
    for (const step of plan.steps) {
      const subTask: Omit<Task, "createdAt" | "updatedAt" | "completedAt"> = {
        id: step.id,
        type: step.type,
        status: "pending",
        priority: parentTask.priority,
        payload: { ...step.payload, workflowStep: step.order, dependsOn: step.dependsOn },
        sourceChannel: parentTask.sourceChannel,
        sourceMessageId: parentTask.sourceMessageId,
        agentId: null,
        conductorId: "workflow",
        result: null,
        retryCount: 0,
        maxRetries: parentTask.maxRetries,
      };

      const created = taskRepo.insert(subTask);
      this.publish("task:created", { task: created });
    }
  }
}
