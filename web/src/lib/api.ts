const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export interface StatusResponse {
  timestamp: string;
  tasks: { pending: number; running: number; completed: number; failed: number };
  messages: { new: number };
  needsReview: number;
}

export interface Task {
  id: string;
  type: string;
  status: string;
  priority: string;
  payload: Record<string, unknown>;
  sourceChannel: string | null;
  conductorId: string | null;
  result: AgentOutput | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AgentOutput {
  status: string;
  priority: string;
  summary: string;
  needsReview: boolean;
  outputs: Array<{ type: string; content: string }>;
  metadata: Record<string, unknown>;
  error?: string;
}

export interface Message {
  id: string;
  channel: string;
  direction: string;
  from: string;
  to: string[];
  subject: string | null;
  body: string;
  metadata: Record<string, unknown>;
  status: string;
  taskId: string | null;
  threadId: string | null;
  createdAt: string;
}

export interface AvailableSkill {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  depends: string[];
  conflicts: string[];
  path: string;
}

export interface SkillState {
  engineVersion: string;
  coreVersion: string;
  appliedSkills: Array<{
    name: string;
    version: string;
    appliedAt: string;
    fileHashes: Record<string, string>;
  }>;
}

export interface ApplyResult {
  success: boolean;
  skill: string;
  version: string;
  filesAdded: string[];
  filesModified: string[];
  mergeConflicts: string[];
  npmDepsAdded: Record<string, string>;
  envVarsAdded: string[];
  error?: string;
  durationMs: number;
}

export interface UninstallResult {
  success: boolean;
  skill: string;
  filesRemoved: string[];
  filesRestored: string[];
  error?: string;
}

export const api = {
  getStatus: () => request<StatusResponse>("/status"),

  getTasks: (status?: string) =>
    request<Task[]>(`/tasks${status ? `?status=${status}` : ""}`),

  getTask: (id: string) => request<Task>(`/tasks/${id}`),

  approveTask: (id: string) =>
    request<{ ok: boolean }>(`/tasks/${id}/approve`, { method: "PUT" }),

  getMessages: (status = "new") =>
    request<Message[]>(`/messages?status=${status}`),

  createMessage: (data: {
    channel: string;
    from: string;
    to: string[];
    subject?: string;
    body: string;
    threadId?: string;
  }) => request<Message>("/messages", { method: "POST", body: JSON.stringify(data) }),

  createNote: (data: {
    from: string;
    subject?: string;
    body: string;
    caseRef?: string;
  }) => request<Message>("/notes", { method: "POST", body: JSON.stringify(data) }),

  // Skills API
  getSkills: () => request<AvailableSkill[]>("/skills"),

  getSkillState: () => request<SkillState>("/skills/state"),

  applySkill: (skillPath: string) =>
    request<ApplyResult>("/skills/apply", {
      method: "POST",
      body: JSON.stringify({ skillPath }),
    }),

  uninstallSkill: (skillName: string) =>
    request<UninstallResult>("/skills/uninstall", {
      method: "POST",
      body: JSON.stringify({ skillName }),
    }),
};
