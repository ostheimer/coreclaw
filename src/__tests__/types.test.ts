/**
 * Tests for the AgentOutput schema validation.
 */
import { AgentOutputSchema } from "../types.js";

describe("AgentOutputSchema", () => {
  it("validates a valid completed output", () => {
    const result = AgentOutputSchema.safeParse({
      status: "completed",
      priority: "normal",
      summary: "Handled 3 support emails",
      needsReview: false,
      outputs: [{ type: "text", content: "Response sent." }],
      metadata: { tokens: 1200, duration_ms: 800 },
    });
    expect(result.success).toBe(true);
  });

  it("validates an escalated output", () => {
    const result = AgentOutputSchema.safeParse({
      status: "escalated",
      priority: "urgent",
      summary: "Cannot determine billing intent, escalating to human",
      needsReview: true,
      outputs: [],
      metadata: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = AgentOutputSchema.safeParse({
      status: "unknown-status",
      priority: "normal",
      summary: "test",
      needsReview: false,
      outputs: [],
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = AgentOutputSchema.safeParse({
      status: "completed",
      priority: "normal",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional error field", () => {
    const result = AgentOutputSchema.safeParse({
      status: "failed",
      priority: "normal",
      summary: "Agent crashed",
      needsReview: true,
      outputs: [],
      metadata: {},
      error: "Timeout after 30s",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("Timeout after 30s");
    }
  });
});
