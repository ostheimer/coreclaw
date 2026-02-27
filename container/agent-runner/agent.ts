import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// ---------- Types ----------

interface ContainerInput {
  taskId: string;
  taskType: string;
  payload: Record<string, unknown>;
  secrets: Record<string, string>;
  conductorContext?: Record<string, unknown>;
}

interface AgentOutput {
  status: "completed" | "failed" | "partial" | "escalated";
  priority: "low" | "normal" | "high" | "urgent";
  summary: string;
  needsReview: boolean;
  outputs: Array<{ type: string; content: string; metadata?: Record<string, unknown> }>;
  metadata: Record<string, unknown>;
  error?: string;
}

// Sentinel markers — must match host-side container-runner.ts
const OUTPUT_START_MARKER = "---CORECLAW_OUTPUT_START---";
const OUTPUT_END_MARKER = "---CORECLAW_OUTPUT_END---";

const IPC_INPUT_DIR = "/workspace/ipc/input";
const IPC_POLL_INTERVAL_MS = 500;

// ---------- Main ----------

async function run(): Promise<void> {
  // Read input from stdin (contains secrets — delete immediately after parsing)
  const rawInput = await readStdin();
  let input: ContainerInput;

  try {
    input = JSON.parse(rawInput) as ContainerInput;
  } catch {
    writeOutput(errorOutput("Failed to parse stdin input JSON"));
    process.exit(1);
  }

  // Extract secrets, then clear from input object
  const apiKey = input.secrets?.["ANTHROPIC_API_KEY"];
  input.secrets = {};

  if (!apiKey) {
    writeOutput(errorOutput("No ANTHROPIC_API_KEY provided in secrets"));
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const start = Date.now();

  try {
    const result = await executeTask(client, input);
    writeOutput(result);

    // Enter query loop: wait for IPC follow-up messages
    await queryLoop(client, input, result);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    writeOutput(errorOutput(error, Date.now() - start));
    process.exit(1);
  }
}

// ---------- Task Execution ----------

async function executeTask(client: Anthropic, input: ContainerInput): Promise<AgentOutput> {
  const start = Date.now();
  const systemPrompt = getSystemPrompt(input.taskType);
  const userMessage = formatUserMessage(input);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return {
    status: "completed",
    priority: "normal",
    summary: text.slice(0, 200),
    needsReview: false,
    outputs: [{ type: "text", content: text }],
    metadata: {
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      duration_ms: Date.now() - start,
      model: response.model,
      agentId: input.taskId,
    },
  };
}

// ---------- IPC Query Loop ----------

async function queryLoop(
  client: Anthropic,
  input: ContainerInput,
  _lastResult: AgentOutput,
): Promise<void> {
  if (!fs.existsSync(IPC_INPUT_DIR)) return;

  while (true) {
    const message = await waitForIpcMessage();
    if (message === null) break; // _close sentinel

    const start = Date.now();
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: getSystemPrompt(input.taskType),
        messages: [{ role: "user", content: message }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      writeOutput({
        status: "completed",
        priority: "normal",
        summary: text.slice(0, 200),
        needsReview: false,
        outputs: [{ type: "text", content: text }],
        metadata: {
          tokens: response.usage.input_tokens + response.usage.output_tokens,
          duration_ms: Date.now() - start,
          model: response.model,
          agentId: input.taskId,
        },
      });
    } catch (err) {
      writeOutput(errorOutput(err instanceof Error ? err.message : String(err), Date.now() - start));
    }
  }
}

async function waitForIpcMessage(): Promise<string | null> {
  while (true) {
    // Check for close sentinel
    if (fs.existsSync(path.join(IPC_INPUT_DIR, "_close"))) {
      return null;
    }

    // Check for input files
    try {
      const files = fs.readdirSync(IPC_INPUT_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort();

      if (files.length > 0) {
        const filePath = path.join(IPC_INPUT_DIR, files[0]!);
        const content = fs.readFileSync(filePath, "utf-8");
        fs.unlinkSync(filePath);

        const parsed = JSON.parse(content) as { type: string; text: string };
        if (parsed.type === "message" && parsed.text) {
          return parsed.text;
        }
      }
    } catch {
      // Ignore read errors, retry on next poll
    }

    await sleep(IPC_POLL_INTERVAL_MS);
  }
}

// ---------- Prompts ----------

function getSystemPrompt(taskType: string): string {
  const prompts: Record<string, string> = {
    "email-agent": `You are a professional email assistant for business communication.
Handle email tasks: draft replies, summarize threads, categorize inquiries.
Always return structured JSON output.`,
    "support-agent": `You are a customer support agent.
Be helpful, empathetic, and solution-focused.
Escalate when uncertain — set status to "escalated".`,
    "billing-agent": `You are a billing specialist.
Handle billing inquiries accurately. Never guess amounts.
Flag anything over 10000 EUR for review.`,
    "chat-agent": `You are a business chat assistant.
Respond clearly and helpfully to team messages.`,
    "general-agent": `You are a general business assistant.
Help with a variety of business tasks.`,
  };
  return prompts[taskType] ?? prompts["general-agent"]!;
}

function formatUserMessage(input: ContainerInput): string {
  const parts = [`Task: ${input.taskType}`, `Task ID: ${input.taskId}`];

  if (input.conductorContext && Object.keys(input.conductorContext).length > 0) {
    parts.push(`Context: ${JSON.stringify(input.conductorContext, null, 2)}`);
  }

  parts.push(`Payload:\n${JSON.stringify(input.payload, null, 2)}`);

  return parts.join("\n\n");
}

// ---------- Output ----------

function writeOutput(output: AgentOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function errorOutput(error: string, durationMs = 0): AgentOutput {
  return {
    status: "failed",
    priority: "normal",
    summary: `Agent failed: ${error.slice(0, 200)}`,
    needsReview: true,
    outputs: [],
    metadata: { duration_ms: durationMs },
    error,
  };
}

// ---------- Helpers ----------

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void run();
