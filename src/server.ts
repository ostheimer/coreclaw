import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import { taskRepo, messageRepo, promptRepo } from "./db.js";
import { ipcBus } from "./ipc.js";
import type { IpcEvent } from "./ipc.js";
import type { Message } from "./types.js";
import { randomUUID } from "crypto";

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
