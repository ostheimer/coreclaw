import fs from "fs";
import path from "path";
import { GraphClient } from "./graph-client.js";
import type { M365Config, DeltaSyncState, GraphMailMessage } from "./types.js";
import { messageRepo } from "../../db.js";
import { ipcBus } from "../../ipc.js";
import type { Message } from "../../types.js";
import { randomUUID } from "crypto";

const SYNC_STATE_FILE = "data/email-sync-state.json";

/**
 * Email sync engine — polls Microsoft 365 via Graph API delta queries.
 * Efficiently fetches only new/changed messages since last sync.
 * Stores new emails in the DB and publishes IPC events.
 */
export class EmailSync {
  private readonly client: GraphClient;
  private readonly config: M365Config;
  private syncState: DeltaSyncState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private folderId: string | null = null;

  constructor(config: M365Config) {
    this.config = config;
    this.client = new GraphClient(config);
    this.syncState = this.loadSyncState();
  }

  getClient(): GraphClient {
    return this.client;
  }

  isRunning(): boolean {
    return this.running;
  }

  getSyncState(): DeltaSyncState {
    return this.syncState;
  }

  // ---------- Lifecycle ----------

  async start(): Promise<void> {
    if (this.running) return;
    console.log(`[email-sync] Starting for ${this.config.mailbox} (every ${this.config.syncIntervalSec}s)`);

    const folder = await this.client.getFolderByName(this.config.folder);
    if (!folder) {
      throw new Error(`Folder "${this.config.folder}" not found in mailbox "${this.config.mailbox}"`);
    }
    this.folderId = folder.id;

    this.running = true;

    // Initial sync
    await this.syncOnce();

    // Start polling
    this.timer = setInterval(() => {
      void this.syncOnce();
    }, this.config.syncIntervalSec * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log("[email-sync] Stopped");
  }

  // ---------- Sync Logic ----------

  async syncOnce(): Promise<number> {
    if (!this.folderId) return 0;

    try {
      const { messages, nextDeltaLink } = await this.client.deltaMessages(
        this.folderId,
        this.syncState.deltaLink,
      );

      let newCount = 0;

      for (const graphMsg of messages) {
        if (this.isAlreadyStored(graphMsg)) continue;

        const msg = this.graphToMessage(graphMsg);
        messageRepo.insert(msg);
        newCount++;

        ipcBus.publish("message:received", "email-sync", {
          message: msg,
          source: "m365",
          mailbox: this.config.mailbox,
        });

        if (this.config.markAsRead && !graphMsg.isRead) {
          try {
            await this.client.markAsRead(graphMsg.id);
          } catch {
            // Non-critical — continue processing
          }
        }
      }

      // Update sync state
      if (nextDeltaLink) {
        this.syncState.deltaLink = nextDeltaLink;
      }
      this.syncState.lastSyncAt = new Date().toISOString();
      this.syncState.messagesProcessed += newCount;
      this.saveSyncState();

      if (newCount > 0) {
        console.log(`[email-sync] ${newCount} new email(s) from ${this.config.mailbox}`);
      }

      return newCount;
    } catch (err) {
      console.error("[email-sync] Sync error:", err);

      // If delta link is stale, reset and do a full sync next time
      if (err instanceof Error && err.message.includes("410")) {
        console.warn("[email-sync] Delta link expired, resetting for full resync");
        this.syncState.deltaLink = null;
        this.saveSyncState();
      }

      return 0;
    }
  }

  // ---------- Conversion ----------

  private graphToMessage(graphMsg: GraphMailMessage): Omit<Message, "createdAt" | "updatedAt"> {
    const from = graphMsg.from?.emailAddress?.address ?? "unknown";
    const to = graphMsg.toRecipients?.map((r) => r.emailAddress.address) ?? [];
    const cc = graphMsg.ccRecipients?.map((r) => r.emailAddress.address) ?? [];

    return {
      id: randomUUID(),
      channel: "email",
      direction: "inbound",
      externalId: graphMsg.id,
      from,
      to,
      subject: graphMsg.subject ?? "(kein Betreff)",
      body: graphMsg.body?.content ?? graphMsg.bodyPreview ?? "",
      metadata: {
        conversationId: graphMsg.conversationId,
        internetMessageId: graphMsg.internetMessageId,
        importance: graphMsg.importance,
        hasAttachments: graphMsg.hasAttachments,
        cc,
        categories: graphMsg.categories,
        receivedAt: graphMsg.receivedDateTime,
        sentAt: graphMsg.sentDateTime,
        fromName: graphMsg.from?.emailAddress?.name,
        mailbox: this.config.mailbox,
      },
      status: "new",
      taskId: null,
      threadId: graphMsg.conversationId ?? null,
    };
  }

  private isAlreadyStored(graphMsg: GraphMailMessage): boolean {
    const existing = messageRepo.findByStatus("new", 500);
    return existing.some(
      (m) => m.externalId === graphMsg.id || (
        m.metadata &&
        typeof m.metadata === "object" &&
        (m.metadata as Record<string, unknown>)["internetMessageId"] === graphMsg.internetMessageId
      ),
    );
  }

  // ---------- State Persistence ----------

  private loadSyncState(): DeltaSyncState {
    try {
      if (fs.existsSync(SYNC_STATE_FILE)) {
        const raw = fs.readFileSync(SYNC_STATE_FILE, "utf-8");
        return JSON.parse(raw) as DeltaSyncState;
      }
    } catch {
      // Corrupt state file — start fresh
    }
    return { deltaLink: null, lastSyncAt: "", messagesProcessed: 0 };
  }

  private saveSyncState(): void {
    fs.mkdirSync(path.dirname(SYNC_STATE_FILE), { recursive: true });
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(this.syncState, null, 2));
  }
}
