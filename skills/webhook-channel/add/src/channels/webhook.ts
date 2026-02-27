import crypto from "crypto";
import type { ChannelAdapter } from "../types.js";

const WEBHOOK_SECRET = process.env["WEBHOOK_SECRET"] ?? "";
const OUTBOUND_URL = process.env["WEBHOOK_OUTBOUND_URL"] ?? "";

/**
 * Generic webhook channel adapter.
 * Inbound: Validates HMAC signature, parses JSON payload.
 * Outbound: POSTs structured JSON to a configurable URL.
 */
export class WebhookChannel implements ChannelAdapter {
  readonly name = "webhook";

  async start(): Promise<void> {
    console.log("[webhook] Channel started");
  }

  async stop(): Promise<void> {
    console.log("[webhook] Channel stopped");
  }

  async send(to: string[], subject: string | null, body: string): Promise<void> {
    if (!OUTBOUND_URL) {
      console.warn("[webhook] No WEBHOOK_OUTBOUND_URL configured, skipping send");
      return;
    }

    const payload = { to, subject, body, timestamp: new Date().toISOString() };
    const signature = signPayload(JSON.stringify(payload));

    await fetch(OUTBOUND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CoreClaw-Signature": signature,
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Validates an incoming webhook request.
   * Call this from the HTTP API route handler.
   */
  static validateSignature(body: string, signature: string): boolean {
    if (!WEBHOOK_SECRET) return true;
    const expected = signPayload(body);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

function signPayload(payload: string): string {
  if (!WEBHOOK_SECRET) return "";
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
}
