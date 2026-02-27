import { z } from "zod";

// ---------- Agent Output ----------

export const AgentOutputSchema = z.object({
  status: z.enum(["completed", "failed", "partial", "escalated"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  summary: z.string(),
  needsReview: z.boolean(),
  outputs: z.array(
    z.object({
      type: z.string(),
      content: z.string(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
  metadata: z.object({
    tokens: z.number().optional(),
    duration_ms: z.number().optional(),
    model: z.string().optional(),
    agentId: z.string().optional(),
  }),
  error: z.string().optional(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ---------- Task ----------

export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  sourceChannel: string | null;
  sourceMessageId: string | null;
  agentId: string | null;
  conductorId: string | null;
  result: AgentOutput | null;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

// ---------- Message ----------

export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "new" | "processing" | "handled" | "failed";

export interface Message {
  id: string;
  channel: string;
  direction: MessageDirection;
  externalId: string | null;
  from: string;
  to: string[];
  subject: string | null;
  body: string;
  metadata: Record<string, unknown>;
  status: MessageStatus;
  taskId: string | null;
  threadId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- Session ----------

export interface Session {
  id: string;
  agentId: string;
  taskId: string;
  containerId: string | null;
  status: "starting" | "running" | "stopped" | "error";
  startedAt: Date;
  stoppedAt: Date | null;
}

// ---------- Feedback ----------

export interface Feedback {
  id: string;
  taskId: string;
  sessionId: string | null;
  rating: "positive" | "negative" | "neutral";
  comment: string | null;
  promptVersion: string | null;
  createdAt: Date;
}

// ---------- Prompt Version ----------

export interface PromptVersion {
  id: string;
  name: string;
  content: string;
  version: number;
  active: boolean;
  activatedAt: Date | null;
  createdAt: Date;
  metrics: PromptMetrics | null;
}

export interface PromptMetrics {
  usageCount: number;
  positiveRating: number;
  negativeRating: number;
  avgDuration_ms: number;
  correctionRate: number;
}

// ---------- Conductor ----------

export type ConductorRole =
  | "chief"
  | "inbox"
  | "quality"
  | "workflow"
  | "context"
  | "learning";

export interface ConductorResult {
  conductorId: ConductorRole;
  success: boolean;
  output: Record<string, unknown>;
  durationMs: number;
}

// ---------- Channel ----------

export interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(to: string[], subject: string | null, body: string): Promise<void>;
}

// ---------- Queue ----------

export interface QueueItem {
  task: Task;
  addedAt: Date;
  attempt: number;
}
