# CoreClaw

Business-grade AI agent orchestration. Instead of one orchestrator, several specialized conductors
(Chief, Inbox, Quality, Workflow, Context, Learning) manage agent work, so a human does not become the
bottleneck ("agent fatigue"). Agents run in Docker containers and return structured output. Concepts and
comparison with NanoClaw/OpenClaw: `README.md`; planned phases: `ROADMAP.md`.

Stack: Node.js >= 22 (uses `node:sqlite`), TypeScript, Jest (ts-jest), React + Vite + Tailwind in `web/`.
There are no CI workflows; a merge to `main` triggers no build or deploy.

## Layout

```
src/index.ts              Host process: starts conductors, queue, HTTP/WebSocket server, email sync
src/types.ts              Shared types (AgentOutput, Task, Message, Session, ChannelAdapter)
src/db.ts                 SQLite repositories (messageRepo, taskRepo, sessionRepo, promptRepo, draftRepo, correctionRepo)
src/queue.ts              Priority queue with concurrency, retry, events
src/container-runner.ts   Docker lifecycle for agent tasks
src/ipc.ts                In-process event bus (ipcBus) for conductor communication
src/conductors/           The six conductors, all extend BaseConductor
src/channels/email/       Only implemented channel (Microsoft Graph)
src/skills/               Skills engine: apply, uninstall, three-way merge, backup
src/server.ts             HTTP API + WebSocket for the GUI (PORT, default 3000)
container/agent-runner/   In-container agent (Claude SDK + structured output), own Dockerfile
conductors/<name>/        rules.md with business rules (chief, inbox, quality)
prompts/                  Versioned prompt templates
skills/                   Installable skill packages (manifest.json + files), e.g. webhook-channel, wordpress-adapter
```

## Commands

```bash
npm run setup         # install root and web/ dependencies
npm run dev           # host process via tsx (no watch mode); npm run dev:web: Vite GUI on :5173
npm run build         # tsc + web build
npm test              # Jest, src/__tests__/, DB_PATH=:memory: is set by the tests
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint on src/
npm run docker:build  # builds the coreclaw-agent image; Docker must be running
```

`/setup` is a Claude Code skill (`.claude/skills/setup/SKILL.md`) that checks Node and Docker, installs, and builds.

## Environment

`.env` (copy from `.env.example`): `ANTHROPIC_API_KEY` (required, the only secret passed into agent
containers), `DB_PATH` (default `data/coreclaw.db`), `AGENT_IMAGE` (default `coreclaw-agent:latest`),
`PORT` (GUI, default 3000).

## Conventions and pitfalls

- Shell commands go through `execFileNoThrow` (`src/utils/execFileNoThrow.ts`) to avoid shell injection.
  The only direct `child_process` use is `container-runner.ts`, which spawns `docker`.
- Agent logic runs only in containers via `container-runner.ts`, never on the host.
- Agents return `AgentOutput`, validated by `AgentOutputSchema`; no free-text results.
- Conductors talk via `ipcBus.publish()` / `ipcBus.subscribe()`, not by calling each other.
- All SQL lives in `src/db.ts` behind the repositories. The DB runs in WAL mode (`PRAGMA journal_mode`
  is set there); do not change it.
- Applying a skill (`src/skills/apply.ts`) copies files into `src/`, runs `npm install` and the manifest's
  `post_apply` commands in the project root.
- New conductor: extend `BaseConductor`, implement `registerSubscriptions()`, export it in
  `src/conductors/index.ts`, add it to the conductor list in `src/index.ts`. New agent type: add a route in
  `InboxConductor.triage()`, a prompt in `prompts/`, handling in `container/agent-runner/agent.ts`.
  New channel: implement `ChannelAdapter` (`src/types.ts`); email is wired directly in `src/index.ts`.
- Code, comments and documentation are English; `README_de.md` is the German translation of the README.
- Target size is roughly 15-20k lines of TypeScript; refactor rather than grow far beyond it.
