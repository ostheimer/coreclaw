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
};
