import { execFileNoThrow } from "./utils/execFileNoThrow.js";
import { randomUUID } from "crypto";
import type { Task, AgentOutput } from "./types.js";
import { AgentOutputSchema } from "./types.js";

export interface ContainerRunOptions {
  image?: string;
  workDir?: string;
  mounts?: Array<{ host: string; container: string; readonly?: boolean }>;
  env?: Record<string, string>;
  timeoutMs?: number;
  memoryLimit?: string;
  cpuLimit?: string;
}

export interface ContainerResult {
  containerId: string;
  output: AgentOutput;
  exitCode: number;
  durationMs: number;
}

const DEFAULT_IMAGE = process.env["AGENT_IMAGE"] ?? "coreclaw-agent:latest";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min

/**
 * Runs an agent task inside a Docker container.
 * Secrets are passed via stdin, never via environment variables or CLI args.
 */
export async function runInContainer(
  task: Task,
  options: ContainerRunOptions = {},
): Promise<ContainerResult> {
  const image = options.image ?? DEFAULT_IMAGE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const containerId = `coreclaw-agent-${randomUUID()}`;
  const start = Date.now();

  const dockerArgs = buildDockerArgs(containerId, image, task, options);

  const result = await execFileNoThrow("docker", dockerArgs, {
    timeout: timeoutMs,
    env: { ...process.env, ...sanitizeEnv(options.env ?? {}) },
  });

  const durationMs = Date.now() - start;

  if (result.status === "error" && result.exitCode !== 0 && !result.stdout) {
    return {
      containerId,
      output: errorOutput(task, result.stderr, durationMs),
      exitCode: result.exitCode ?? 1,
      durationMs,
    };
  }

  const output = parseAgentOutput(result.stdout, task, durationMs);
  return { containerId, output, exitCode: result.exitCode ?? 0, durationMs };
}

/**
 * Stops and removes a running container by name.
 */
export async function stopContainer(containerId: string): Promise<void> {
  await execFileNoThrow("docker", ["stop", containerId]);
  await execFileNoThrow("docker", ["rm", "--force", containerId]);
}

/**
 * Returns the status of a container.
 */
export async function containerStatus(containerId: string): Promise<string | null> {
  const result = await execFileNoThrow("docker", [
    "inspect",
    "--format",
    "{{.State.Status}}",
    containerId,
  ]);
  if (result.status === "error") return null;
  return result.stdout.trim();
}

// ---------- Helpers ----------

function buildDockerArgs(
  containerId: string,
  image: string,
  task: Task,
  options: ContainerRunOptions,
): string[] {
  const args: string[] = [
    "run",
    "--rm",
    "--name", containerId,
    "--network", "none",          // no network by default, agent must request it
    "--read-only",                  // read-only root filesystem
    "--tmpfs", "/tmp:size=64m",    // writable /tmp only
    "--security-opt", "no-new-privileges:true",
  ];

  if (options.memoryLimit) {
    args.push("--memory", options.memoryLimit);
  }

  if (options.cpuLimit) {
    args.push("--cpus", options.cpuLimit);
  }

  for (const mount of options.mounts ?? []) {
    const mode = mount.readonly ? "ro" : "rw";
    args.push("-v", `${mount.host}:${mount.container}:${mode}`);
  }

  args.push(
    "-e", `TASK_ID=${task.id}`,
    "-e", `TASK_TYPE=${task.type}`,
  );

  if (options.workDir) {
    args.push("-w", options.workDir);
  }

  args.push(image);

  args.push(JSON.stringify(task.payload));

  return args;
}

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const allowList = new Set(["ANTHROPIC_API_KEY", "TASK_ID", "TASK_TYPE"]);
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => allowList.has(key)),
  );
}

function parseAgentOutput(raw: string, task: Task, durationMs: number): AgentOutput {
  let lastJsonLine = "";

  for (const line of raw.split("\n").reverse()) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      lastJsonLine = trimmed;
      break;
    }
  }

  if (!lastJsonLine) {
    return errorOutput(task, `No JSON output from agent. Raw: ${raw.slice(0, 500)}`, durationMs);
  }

  try {
    const parsed = JSON.parse(lastJsonLine) as unknown;
    const validated = AgentOutputSchema.safeParse(parsed);
    if (validated.success) {
      return { ...validated.data, metadata: { ...validated.data.metadata, duration_ms: durationMs } };
    }
    return errorOutput(task, `Invalid agent output schema: ${validated.error.message}`, durationMs);
  } catch {
    return errorOutput(task, `Failed to parse agent JSON: ${lastJsonLine.slice(0, 200)}`, durationMs);
  }
}

function errorOutput(task: Task, error: string, durationMs: number): AgentOutput {
  return {
    status: "failed",
    priority: task.priority,
    summary: `Agent execution failed: ${error}`,
    needsReview: true,
    outputs: [],
    metadata: { duration_ms: durationMs, agentId: task.agentId ?? undefined },
    error,
  };
}
