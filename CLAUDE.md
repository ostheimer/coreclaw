# CoreClaw — Claude Code Integration

This file tells Claude Code everything it needs to know to work effectively with the CoreClaw codebase.

## What is CoreClaw

Business-grade AI agent orchestration. Multiple specialized conductors replace a single orchestrator to solve agent fatigue — the problem of humans becoming the bottleneck when managing multiple AI agents.

**Key concepts:**
- **Conductors** — specialized orchestration roles (Chief, Inbox, Quality, Workflow, Context, Learning)
- **Tasks** — units of work with structured outputs (status, priority, summary, needsReview)
- **Container isolation** — all agents run in Docker, never on the host
- **Business channels** — Email, Teams, Slack, Jira, Zendesk

## Architecture Quick Reference

```
src/index.ts              Host process — starts conductors, manages queue
src/types.ts              Shared types (AgentOutput, Task, Message, Session)
src/db.ts                 SQLite repositories (messageRepo, taskRepo, sessionRepo, promptRepo)
src/queue.ts              Priority queue with concurrency, retry, events
src/container-runner.ts   Docker container lifecycle for agent tasks
src/ipc.ts                In-process event bus (IpcBus) for conductor communication
src/conductors/           Six conductor implementations
src/channels/             Channel adapters (email, teams, slack, etc.)
src/utils/                Utilities (execFileNoThrow — always use for shell commands)
container/agent-runner/   In-container agent logic (Claude SDK + structured output)
conductors/{name}/        Per-conductor config files and rules.md
prompts/                  Versioned prompt templates
```

## Development Commands

```bash
npm run dev          # Start with tsx watch (hot reload)
npm run build        # Compile TypeScript
npm test             # Run Jest tests
npm run typecheck    # TypeScript check without emit
npm run lint         # ESLint
docker:build         # Build agent container image
```

## Key Rules

1. **Shell commands: always use `execFileNoThrow`** from `src/utils/execFileNoThrow.ts`. Never use `child_process` directly. This prevents shell injection.
2. **Agents always in containers** — never run agent logic on the host. `container-runner.ts` handles this.
3. **Structured output always** — agents must return `AgentOutput` (validated by `AgentOutputSchema`). No free text returns.
4. **Conductors communicate via IPC** — use `ipcBus.publish()` and `ipcBus.subscribe()`. No direct conductor-to-conductor method calls.
5. **Repositories for all DB access** — use `messageRepo`, `taskRepo`, `sessionRepo`, `promptRepo`. Never write raw SQL outside `db.ts`.
6. **SQLite in WAL mode** — already configured. Don't change `journal_mode`.

## Adding a New Channel

1. Create `src/channels/{name}.ts` implementing `ChannelAdapter`
2. Register in `src/index.ts`
3. The Inbox Conductor's `triage()` method handles routing

## Adding a New Conductor

1. Extend `BaseConductor` in `src/conductors/`
2. Implement `registerSubscriptions()` for IPC events
3. Create `conductors/{name}/rules.md` for business rules
4. Add to `conductors/index.ts` and start in `src/index.ts`

## Adding a New Agent Type

1. Add task type to `InboxConductor.triage()` routing
2. Create agent prompt in `prompts/`
3. The in-container `agent.ts` handles execution

## Slash Commands

- `/setup` — install dependencies, build container, verify environment
- `/status` — show current task queue and conductor status
- `/add-channel {name}` — scaffold a new channel adapter
- `/add-conductor {name}` — scaffold a new conductor

## Testing

Tests are in `src/__tests__/`. Run `npm test`. Tests use in-memory SQLite (`DB_PATH=:memory:`).

All new features need tests. Tests also serve as the basis for Playwright integration tests.

## Environment Variables

```
ANTHROPIC_API_KEY=    # Required for agents in containers
DB_PATH=              # SQLite path (default: data/coreclaw.db)
AGENT_IMAGE=          # Docker image for agents (default: coreclaw-agent:latest)
```

## Codebase Size Target

~15–20k lines of TypeScript. If a change grows this significantly, refactor instead of adding.

## Language Rules

- Code and documentation: English
- Comments in code: English
- Responses to the human developer: German
- First translation: German
