import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import { taskRepo, messageRepo, promptRepo } from "./db.js";
import { ipcBus } from "./ipc.js";
import type { IpcEvent } from "./ipc.js";
import type { Message } from "./types.js";
import { randomUUID } from "crypto";
import { listAvailableSkills, readState, applySkill, uninstallSkill } from "./skills/index.js";
import { EmailConfigStore } from "./channels/email/config-store.js";
import { GraphClient } from "./channels/email/graph-client.js";
import { EmailSync } from "./channels/email/sync.js";
import type { M365Config } from "./channels/email/types.js";
import { draftRepo, correctionRepo } from "./db.js";
import {
  approveDraft,
  rejectDraft,
  editAndApproveDraft,
  getApprovalStats,
} from "./approval/engine.js";
import { analyzeCorrections, generatePromptSuggestions } from "./learning/index.js";
import { loadPersonality, savePersonality, generateSystemPrompt } from "./personality/index.js";
import type { Personality } from "./personality/index.js";

const emailConfigStore = new EmailConfigStore();
let emailSync: EmailSync | null = null;

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const WEB_DIR = path.join(process.cwd(), "web", "dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// ---------- HTTP API ----------

function handleApi(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const route = `${method} ${url.pathname}`;

  try {
    if (route === "GET /api/status") {
      return json(res, getStatus());
    }

    if (route === "GET /api/tasks") {
      const status = url.searchParams.get("status");
      const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
      const tasks = status ? taskRepo.findByStatus(status as "pending", limit) : taskRepo.findPending(limit);
      return json(res, tasks);
    }

    if (route.startsWith("GET /api/tasks/")) {
      const id = url.pathname.split("/")[3];
      if (!id) return notFound(res);
      const task = taskRepo.findById(id);
      return task ? json(res, task) : notFound(res);
    }

    if (route === "PUT /api/tasks/" || route.match(/^PUT \/api\/tasks\/.+\/approve$/)) {
      const id = url.pathname.split("/")[3];
      if (!id) return notFound(res);
      taskRepo.updateStatus(id, "completed");
      return json(res, { ok: true });
    }

    if (route === "GET /api/messages") {
      const status = url.searchParams.get("status") ?? "new";
      const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
      const messages = messageRepo.findByStatus(status as "new", limit);
      return json(res, messages);
    }

    if (route === "POST /api/messages") {
      return readBody(req, (body) => {
        const data = JSON.parse(body) as {
          channel: string;
          from: string;
          to: string[];
          subject?: string;
          body: string;
          threadId?: string;
        };
        const msg: Omit<Message, "createdAt" | "updatedAt"> = {
          id: randomUUID(),
          channel: data.channel ?? "manual",
          direction: "inbound",
          externalId: null,
          from: data.from,
          to: data.to ?? [],
          subject: data.subject ?? null,
          body: data.body,
          metadata: {},
          status: "new",
          taskId: null,
          threadId: data.threadId ?? null,
        };
        const created = messageRepo.insert(msg);
        ipcBus.publish("message:received", "api", { message: created });
        json(res, created, 201);
      });
    }

    if (route === "POST /api/notes") {
      return readBody(req, (body) => {
        const data = JSON.parse(body) as {
          from: string;
          subject?: string;
          body: string;
          caseRef?: string;
        };
        const msg: Omit<Message, "createdAt" | "updatedAt"> = {
          id: randomUUID(),
          channel: "manual",
          direction: "inbound",
          externalId: null,
          from: data.from ?? "staff",
          to: [],
          subject: data.subject ?? "Notiz",
          body: data.body,
          metadata: { caseRef: data.caseRef ?? null, type: "call-note" },
          status: "new",
          taskId: null,
          threadId: data.caseRef ?? null,
        };
        const created = messageRepo.insert(msg);
        ipcBus.publish("message:received", "api", { message: created });
        json(res, created, 201);
      });
    }

    if (route === "GET /api/prompts") {
      const name = url.searchParams.get("name");
      if (!name) return json(res, []);
      const active = promptRepo.findActive(name);
      return json(res, active ? [active] : []);
    }

    // ---------- Skills API ----------

    if (route === "GET /api/skills") {
      const available = listAvailableSkills();
      return json(res, available);
    }

    if (route === "GET /api/skills/state") {
      const state = readState();
      return json(res, state);
    }

    if (route === "POST /api/skills/apply") {
      return readBody(req, (body) => {
        const data = JSON.parse(body) as { skillPath: string };
        void applySkill(data.skillPath).then((result) => {
          json(res, result, result.success ? 200 : 400);
        }).catch((err: unknown) => {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
        });
      });
    }

    if (route === "POST /api/skills/uninstall") {
      return readBody(req, (body) => {
        const data = JSON.parse(body) as { skillName: string };
        void uninstallSkill(data.skillName).then((result) => {
          json(res, result, result.success ? 200 : 400);
        }).catch((err: unknown) => {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
        });
      });
    }

    // ---------- Learning API ----------

    if (route === "GET /api/learning/insights") {
      const insights = analyzeCorrections();
      return json(res, insights);
    }

    if (route === "GET /api/learning/suggestions") {
      const suggestions = generatePromptSuggestions();
      return json(res, suggestions);
    }

    // ---------- Personality API ----------

    if (route === "GET /api/personality") {
      return json(res, loadPersonality());
    }

    if (route === "GET /api/personality/prompt") {
      const p = loadPersonality();
      return json(res, { prompt: generateSystemPrompt(p) });
    }

    if (route === "PUT /api/personality") {
      return readBody(req, (body) => {
        try {
          const partial = JSON.parse(body) as Partial<Personality>;
          const current = loadPersonality();
          const updated: Personality = { ...current, ...partial, updatedAt: new Date().toISOString() };
          savePersonality(updated);
          ipcBus.publish("conductor:personality-updated", "server", updated);
          json(res, updated);
        } catch (err) {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 400);
        }
      });
    }

    // ---------- Drafts / Approval API ----------

    if (route === "GET /api/drafts") {
      const status = url.searchParams.get("status");
      const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
      const drafts = status
        ? draftRepo.findByStatus(status as "pending_review", limit)
        : draftRepo.findPendingReview(limit);
      return json(res, drafts);
    }

    if (route === "GET /api/drafts/stats") {
      return json(res, getApprovalStats());
    }

    if (route === "GET /api/drafts/recent") {
      const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
      return json(res, draftRepo.findRecent(limit));
    }

    if (url.pathname.match(/^\/api\/drafts\/[^/]+$/) && method === "GET") {
      const id = url.pathname.split("/")[3]!;
      const draft = draftRepo.findById(id);
      if (!draft) return notFound(res);
      const corrections = correctionRepo.findByDraftId(id);
      const sourceMessage = draft.sourceMessageId ? messageRepo.findById(draft.sourceMessageId) : null;
      return json(res, { draft, corrections, sourceMessage });
    }

    if (url.pathname.match(/^\/api\/drafts\/[^/]+\/approve$/) && method === "POST") {
      const id = url.pathname.split("/")[3]!;
      const result = approveDraft(id);
      return result ? json(res, result) : json(res, { error: "Draft nicht gefunden oder bereits bearbeitet" }, 400);
    }

    if (url.pathname.match(/^\/api\/drafts\/[^/]+\/reject$/) && method === "POST") {
      const id = url.pathname.split("/")[3]!;
      return readBody(req, (body) => {
        const data = JSON.parse(body) as { reason: string };
        const result = rejectDraft(id, data.reason);
        return result ? json(res, result) : json(res, { error: "Draft nicht gefunden oder bereits bearbeitet" }, 400);
      });
    }

    if (url.pathname.match(/^\/api\/drafts\/[^/]+\/edit$/) && method === "POST") {
      const id = url.pathname.split("/")[3]!;
      return readBody(req, (body) => {
        const data = JSON.parse(body) as { body: string; subject?: string; feedback?: string };
        const result = editAndApproveDraft(id, data.body, data.subject ?? null, data.feedback ?? null);
        return result ? json(res, result) : json(res, { error: "Draft nicht gefunden oder bereits bearbeitet" }, 400);
      });
    }

    if (route === "GET /api/corrections") {
      const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
      return json(res, correctionRepo.findRecent(limit));
    }

    // ---------- Email Setup Wizard API ----------

    if (route === "GET /api/email/config") {
      const redacted = emailConfigStore.loadRedacted();
      return json(res, redacted ?? { configured: false });
    }

    if (route === "GET /api/email/status") {
      return json(res, {
        configured: emailConfigStore.hasConfig(),
        syncing: emailSync?.isRunning() ?? false,
        syncState: emailSync?.getSyncState() ?? null,
      });
    }

    if (route === "POST /api/email/test") {
      return readBody(req, (body) => {
        const config = JSON.parse(body) as M365Config;
        const client = new GraphClient(config);
        void client.testConnection().then((result) => {
          json(res, result);
        }).catch((err: unknown) => {
          json(res, { success: false, error: err instanceof Error ? err.message : String(err) });
        });
      });
    }

    if (route === "POST /api/email/mailboxes") {
      return readBody(req, (body) => {
        const config = JSON.parse(body) as M365Config;
        const client = new GraphClient(config);
        void client.listMailboxes().then((users) => {
          json(res, users.map((u) => ({
            email: u.mail ?? u.userPrincipalName,
            displayName: u.displayName,
          })));
        }).catch((err: unknown) => {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
        });
      });
    }

    if (route === "POST /api/email/folders") {
      return readBody(req, (body) => {
        const config = JSON.parse(body) as M365Config;
        const client = new GraphClient(config);
        void client.listFolders().then((folders) => {
          json(res, folders);
        }).catch((err: unknown) => {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
        });
      });
    }

    if (route === "POST /api/email/save") {
      return readBody(req, (body) => {
        const config = JSON.parse(body) as M365Config;
        emailConfigStore.save(config);
        json(res, { ok: true });
      });
    }

    if (route === "POST /api/email/start") {
      const config = emailConfigStore.load();
      if (!config) return json(res, { error: "Keine E-Mail-Konfiguration vorhanden" }, 400);

      if (emailSync?.isRunning()) {
        emailSync.stop();
      }
      emailSync = new EmailSync(config);
      void emailSync.start().then(() => {
        json(res, { ok: true, syncing: true });
      }).catch((err: unknown) => {
        json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
      });
      return;
    }

    if (route === "POST /api/email/stop") {
      if (emailSync) {
        emailSync.stop();
        emailSync = null;
      }
      return json(res, { ok: true, syncing: false });
    }

    if (route === "DELETE /api/email/config") {
      if (emailSync) {
        emailSync.stop();
        emailSync = null;
      }
      emailConfigStore.delete();
      return json(res, { ok: true });
    }

    if (route === "POST /api/email/send") {
      return readBody(req, (body) => {
        const data = JSON.parse(body) as {
          to: string[];
          subject: string;
          body: string;
          cc?: string[];
          replyToMessageId?: string;
        };
        const config = emailConfigStore.load();
        if (!config) return json(res, { error: "Keine E-Mail-Konfiguration vorhanden" }, 400);

        const client = new GraphClient(config);
        void client.sendMail(data.to, data.subject, data.body, data.cc, data.replyToMessageId).then(() => {
          json(res, { ok: true });
        }).catch((err: unknown) => {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
        });
      });
    }

    notFound(res);
  } catch (err) {
    console.error("[API] Error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

function getStatus(): Record<string, unknown> {
  const pending = taskRepo.findPending(100);
  const running = taskRepo.findByStatus("running", 100);
  const completed = taskRepo.findByStatus("completed", 100);
  const failed = taskRepo.findByStatus("failed", 100);
  const newMessages = messageRepo.findByStatus("new", 100);

  return {
    timestamp: new Date().toISOString(),
    tasks: {
      pending: pending.length,
      running: running.length,
      completed: completed.length,
      failed: failed.length,
    },
    messages: {
      new: newMessages.length,
    },
    needsReview: completed.filter((t) => t.result?.needsReview).length,
  };
}

// ---------- Static file serving ----------

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  let filePath = path.join(WEB_DIR, req.url ?? "/");
  if (filePath.endsWith("/")) filePath = path.join(filePath, "index.html");

  const ext = path.extname(filePath);
  if (!ext) filePath += ".html";

  if (!fs.existsSync(filePath)) {
    filePath = path.join(WEB_DIR, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("GUI not built. Run: npm run build:web");
    return;
  }

  const mime = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": mime });
  res.end(content);
}

// ---------- WebSocket (real-time events) ----------

const wsClients = new Set<WebSocket>();

function setupWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));

    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  ipcBus.subscribeAll((event: IpcEvent) => {
    const msg = JSON.stringify({
      type: event.type,
      source: event.source,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
    });
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  });
}

// ---------- Helpers ----------

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function notFound(res: http.ServerResponse): void {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

function readBody(req: http.IncomingMessage, cb: (body: string) => void): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => cb(Buffer.concat(chunks).toString()));
}

// ---------- Start ----------

export function startServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/api/")) {
      handleApi(req, res);
    } else {
      serveStatic(req, res);
    }
  });

  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`[CoreClaw] GUI: http://localhost:${PORT}`);
  });

  return server;
}
