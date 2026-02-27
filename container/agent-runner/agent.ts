import Anthropic from "@anthropic-ai/sdk";
import type { AgentOutput } from "../../src/types.js";

const client = new Anthropic();

const TASK_ID = process.env["TASK_ID"] ?? "unknown";
const TASK_TYPE = process.env["TASK_TYPE"] ?? "general";

async function run(): Promise<void> {
  const payloadArg = process.argv[2];
  if (!payloadArg) {
    writeOutput(errorOutput("No payload argument provided"));
    process.exit(1);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadArg) as Record<string, unknown>;
  } catch {
    writeOutput(errorOutput("Failed to parse payload JSON"));
    process.exit(1);
  }

  const start = Date.now();

  try {
    const result = await executeTask(TASK_TYPE, payload);
    const output: AgentOutput = {
      status: "completed",
      priority: "normal",
      summary: result.summary,
      needsReview: result.needsReview,
      outputs: result.outputs,
      metadata: {
        tokens: result.tokens,
        duration_ms: Date.now() - start,
        model: result.model,
        agentId: TASK_ID,
      },
    };
    writeOutput(output);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    writeOutput(errorOutput(error, Date.now() - start));
    process.exit(1);
  }
}

interface TaskResult {
  summary: string;
  needsReview: boolean;
  outputs: AgentOutput["outputs"];
  tokens?: number;
  model?: string;
}

async function executeTask(
  type: string,
  payload: Record<string, unknown>,
): Promise<TaskResult> {
  const systemPrompt = getSystemPrompt(type);
  const userMessage = formatUserMessage(type, payload);

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("\n");

  return {
    summary: text.slice(0, 200),
    needsReview: false,
    outputs: [{ type: "text", content: text }],
    tokens: response.usage.input_tokens + response.usage.output_tokens,
    model: response.model,
  };
}

function getSystemPrompt(taskType: string): string {
  const prompts: Record<string, string> = {
    "email-agent": "You are an email assistant. Handle business email tasks professionally and concisely.",
    "support-agent": "You are a customer support agent. Be helpful, empathetic, and solution-focused.",
    "billing-agent": "You are a billing specialist. Handle billing inquiries accurately and professionally.",
    "chat-agent": "You are a business chat assistant. Respond clearly and helpfully to team messages.",
    "general-agent": "You are a general business assistant. Help with a variety of business tasks.",
  };
  return prompts[taskType] ?? prompts["general-agent"]!;
}

function formatUserMessage(type: string, payload: Record<string, unknown>): string {
  return `Task type: ${type}\n\nPayload:\n${JSON.stringify(payload, null, 2)}`;
}

function errorOutput(error: string, durationMs = 0): AgentOutput {
  return {
    status: "failed",
    priority: "normal",
    summary: `Agent failed: ${error}`,
    needsReview: true,
    outputs: [],
    metadata: { duration_ms: durationMs, agentId: TASK_ID },
    error,
  };
}

function writeOutput(output: AgentOutput): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

void run();
