/**
 * Tests for container output parsing (sentinel markers).
 * Validates the NanoClaw-inspired output format.
 */
import { OUTPUT_START_MARKER, OUTPUT_END_MARKER } from "../container-runner.js";
import { AgentOutputSchema } from "../types.js";

function extractOutputs(raw: string): Array<ReturnType<typeof AgentOutputSchema.parse>> {
  const outputs: Array<ReturnType<typeof AgentOutputSchema.parse>> = [];
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
      if (validated.success) outputs.push(validated.data);
    } catch { /* skip */ }
  }

  return outputs;
}

const VALID_OUTPUT = JSON.stringify({
  status: "completed",
  priority: "normal",
  summary: "Handled request",
  needsReview: false,
  outputs: [{ type: "text", content: "Done." }],
  metadata: { tokens: 500, duration_ms: 1200 },
});

describe("Container output parsing (sentinel markers)", () => {
  it("parses a single output with markers", () => {
    const raw = `Some debug output\n${OUTPUT_START_MARKER}\n${VALID_OUTPUT}\n${OUTPUT_END_MARKER}\n`;
    const results = extractOutputs(raw);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("completed");
    expect(results[0]!.summary).toBe("Handled request");
  });

  it("parses multiple outputs (query loop)", () => {
    const output2 = JSON.stringify({
      status: "completed",
      priority: "high",
      summary: "Follow-up handled",
      needsReview: true,
      outputs: [{ type: "text", content: "Follow-up response." }],
      metadata: {},
    });
    const raw = [
      "debug line 1",
      OUTPUT_START_MARKER,
      VALID_OUTPUT,
      OUTPUT_END_MARKER,
      "some more debug",
      OUTPUT_START_MARKER,
      output2,
      OUTPUT_END_MARKER,
    ].join("\n");

    const results = extractOutputs(raw);
    expect(results).toHaveLength(2);
    expect(results[0]!.summary).toBe("Handled request");
    expect(results[1]!.summary).toBe("Follow-up handled");
    expect(results[1]!.needsReview).toBe(true);
  });

  it("ignores debug output outside markers", () => {
    const raw = `Lots of debug\nMore debug\nNo markers at all\n`;
    const results = extractOutputs(raw);
    expect(results).toHaveLength(0);
  });

  it("ignores malformed JSON between markers", () => {
    const raw = `${OUTPUT_START_MARKER}\n{not valid json}\n${OUTPUT_END_MARKER}\n`;
    const results = extractOutputs(raw);
    expect(results).toHaveLength(0);
  });

  it("ignores incomplete marker pairs", () => {
    const raw = `${OUTPUT_START_MARKER}\n${VALID_OUTPUT}\nno end marker`;
    const results = extractOutputs(raw);
    expect(results).toHaveLength(0);
  });

  it("validates output schema (rejects invalid status)", () => {
    const invalid = JSON.stringify({
      status: "unknown",
      priority: "normal",
      summary: "test",
      needsReview: false,
      outputs: [],
      metadata: {},
    });
    const raw = `${OUTPUT_START_MARKER}\n${invalid}\n${OUTPUT_END_MARKER}\n`;
    const results = extractOutputs(raw);
    expect(results).toHaveLength(0);
  });
});
