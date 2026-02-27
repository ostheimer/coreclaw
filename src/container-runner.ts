import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Task, AgentOutput } from "./types.js";
import { AgentOutputSchema } from "./types.js";

const OUTPUT_START_MARKER = "---CORECLAW_OUTPUT_START---";
const OUTPUT_END_MARKER = "---CORECLAW_OUTPUT_END---";

export interface ContainerRunOptions {
  image?: string;
  workDir?: string;
  mounts?: Array<{ host: string; container: string; readonly?: boolean }>;
  timeoutMs?: number;
  memoryLimit?: string;
  cpuLimit?: string;
  networkEnabled?: boolean;
}

export interface ContainerResult {
  containerId: string;
  output: AgentOutput;
  exitCode: number;
  durationMs: number;
}

export interface ContainerInput {
  taskId: string;
  taskType: string;
  payload: Record<string, unknown>;
  secrets: Record<string, string>;
  conductorContext?: Record<string, unknown>;
}

const DEFAULT_IMAGE = process.env["AGENT_IMAGE"] ?? "coreclaw-agent:latest";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_STDOUT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Runs an agent task inside a Docker container.
 * Pattern adopted from NanoClaw: stdin for input+secrets, sentinel markers for output,
 * interactive mode for potential follow-up IPC.
 */
export async function runInContainer(
  task: Task,
  options: ContainerRunOptions = {},
): Promise<ContainerResult> {
  const image = options.image ?? DEFAULT_IMAGE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const containerId = `coreclaw-agent-${randomUUID().slice(0, 8)}`;
  const start = Date.now();

  const ipcDir = setupIpcDir(containerId);
  const dockerArgs = buildDockerArgs(containerId, image, ipcDir, options);

  return new Promise<ContainerResult>((resolve) => {
    const container = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const input: ContainerInput = {
      taskId: task.id,
      taskType: task.type,
      payload: task.payload,
      secrets: readSecrets(),
      conductorContext: {},
    };

    // Secrets via stdin — never in env vars or CLI args
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    // Immediately clear secrets from memory
    input.secrets = {};

    let stdout = "";
    let stderr = "";
    let lastOutput: AgentOutput | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const resetTimeout = (): void => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.warn(`[container] ${containerId} timed out after ${timeoutMs}ms`);
        container.kill("SIGTERM");
        setTimeout(() => container.kill("SIGKILL"), 10_000);
      }, timeoutMs);
    };
    resetTimeout();

    container.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_STDOUT_BYTES) {
        stdout += chunk.toString();
      }

      // Stream-parse sentinel markers as they arrive
      const parsed = extractOutputs(stdout);
      if (parsed.length > 0) {
        lastOutput = parsed[parsed.length - 1]!;
        resetTimeout();
      }
    });

    container.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) stderr += line + "\n";
    });

    container.on("close", (exitCode) => {
      if (timeoutId) clearTimeout(timeoutId);
      const durationMs = Date.now() - start;

      // Final parse attempt if no streaming output was caught
      if (!lastOutput) {
        const parsed = extractOutputs(stdout);
        if (parsed.length > 0) {
          lastOutput = parsed[parsed.length - 1]!;
        }
      }

      cleanupIpcDir(containerId);

      if (lastOutput) {
        resolve({ containerId, output: lastOutput, exitCode: exitCode ?? 0, durationMs });
      } else {
        resolve({
          containerId,
          output: errorOutput(task, stderr || `No output from container. Exit code: ${exitCode}`, durationMs),
          exitCode: exitCode ?? 1,
          durationMs,
        });
      }
    });

    container.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      cleanupIpcDir(containerId);
      resolve({
        containerId,
        output: errorOutput(task, `Container spawn failed: ${err.message}`, Date.now() - start),
        exitCode: 1,
        durationMs: Date.now() - start,
      });
    });
  });
}

/**
 * Stops and removes a running container by name.
 */
export async function stopContainer(containerId: string): Promise<void> {
  const stop = spawn("docker", ["stop", containerId]);
  await new Promise<void>((resolve) => stop.on("close", () => resolve()));
  const rm = spawn("docker", ["rm", "--force", containerId]);
  await new Promise<void>((resolve) => rm.on("close", () => resolve()));
}

/**
 * Kills any orphaned coreclaw-agent-* containers from previous runs.
 */
export async function cleanupOrphans(): Promise<void> {
  const ps = spawn("docker", ["ps", "-q", "--filter", "name=coreclaw-agent-"]);
  let ids = "";
  ps.stdout.on("data", (chunk: Buffer) => { ids += chunk.toString(); });
  await new Promise<void>((resolve) => ps.on("close", () => resolve()));

  const containerIds = ids.trim().split("\n").filter(Boolean);
  for (const id of containerIds) {
    console.log(`[container] Cleaning up orphan: ${id}`);
    const kill = spawn("docker", ["rm", "--force", id]);
    await new Promise<void>((resolve) => kill.on("close", () => resolve()));
  }
}

// ---------- IPC Directory ----------

function setupIpcDir(containerId: string): string {
  const ipcDir = path.join(process.cwd(), "data", "ipc", containerId);
  fs.mkdirSync(path.join(ipcDir, "input"), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, "output"), { recursive: true });
  return ipcDir;
}

function cleanupIpcDir(containerId: string): void {
  const ipcDir = path.join(process.cwd(), "data", "ipc", containerId);
  try {
    fs.rmSync(ipcDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Send a follow-up message to a running container via IPC file.
 */
export function sendIpcMessage(containerId: string, message: string): void {
  const ipcDir = path.join(process.cwd(), "data", "ipc", containerId, "input");
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.json`;
  const tempPath = path.join(ipcDir, `.${filename}.tmp`);
  const finalPath = path.join(ipcDir, filename);

  // Atomic write: temp file then rename
  fs.writeFileSync(tempPath, JSON.stringify({ type: "message", text: message }));
  fs.renameSync(tempPath, finalPath);
}

/**
 * Signal a container to close via sentinel file.
 */
export function closeContainer(containerId: string): void {
  const closePath = path.join(process.cwd(), "data", "ipc", containerId, "input", "_close");
  fs.writeFileSync(closePath, "");
}

// ---------- Docker Args ----------

function buildDockerArgs(
  containerId: string,
  image: string,
  ipcDir: string,
  options: ContainerRunOptions,
): string[] {
  const args: string[] = [
    "run",
    "-i",        // Interactive: keep stdin open
    "--rm",
    "--name", containerId,
    "--read-only",
    "--tmpfs", "/tmp:size=64m",
    "--security-opt", "no-new-privileges:true",
  ];

  if (!options.networkEnabled) {
    args.push("--network", "none");
  }

  if (options.memoryLimit) {
    args.push("--memory", options.memoryLimit);
  }

  if (options.cpuLimit) {
    args.push("--cpus", options.cpuLimit);
  }

  // IPC mount — read-write for both directions
  args.push("-v", `${ipcDir}:/workspace/ipc`);

  for (const mount of options.mounts ?? []) {
    const mode = mount.readonly ? "ro" : "rw";
    args.push("-v", `${mount.host}:${mount.container}:${mode}`);
  }

  if (options.workDir) {
    args.push("-w", options.workDir);
  }

  args.push(image);

  return args;
}

// ---------- Secrets ----------

function readSecrets(): Record<string, string> {
  const secrets: Record<string, string> = {};
  const envPath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) return secrets;

  const content = fs.readFileSync(envPath, "utf-8");
  const allowList = new Set(["ANTHROPIC_API_KEY"]);

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (allowList.has(key) && value) {
      secrets[key] = value;
    }
  }

  return secrets;
}

// ---------- Output Parsing ----------

function extractOutputs(raw: string): AgentOutput[] {
  const outputs: AgentOutput[] = [];
  let searchFrom = 0;

  while (true) {
    const startIdx = raw.indexOf(OUTPUT_START_MARKER, searchFrom);
    if (startIdx === -1) break;

    const jsonStart = startIdx + OUTPUT_START_MARKER.length;
    const endIdx = raw.indexOf(OUTPUT_END_MARKER, jsonStart);
    if (endIdx === -1) break;

    const jsonStr = raw.slice(jsonStart, endIdx).trim();
    searchFrom = endIdx + OUTPUT_END_MARKER.length;

    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      const validated = AgentOutputSchema.safeParse(parsed);
      if (validated.success) {
        outputs.push(validated.data);
      }
    } catch {
      // Skip malformed JSON between markers
    }
  }

  return outputs;
}

function errorOutput(task: Task, error: string, durationMs: number): AgentOutput {
  return {
    status: "failed",
    priority: task.priority,
    summary: `Agent execution failed: ${error.slice(0, 200)}`,
    needsReview: true,
    outputs: [],
    metadata: { duration_ms: durationMs, agentId: task.agentId ?? undefined },
    error,
  };
}

export { OUTPUT_START_MARKER, OUTPUT_END_MARKER };
