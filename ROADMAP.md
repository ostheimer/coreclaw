# CoreClaw Roadmap

## Phase 0: Foundation ✅
- [x] Repository created
- [x] README (English + German)
- [x] Roadmap
- [x] Project scaffolding (package.json, tsconfig, directory structure)
- [x] CLAUDE.md for Claude Code integration
- [x] Basic `.claude/skills/setup/SKILL.md`

## Phase 1: Core Infrastructure ✅
- [x] Single Node.js host process (`src/index.ts`)
- [x] SQLite database schema via `node:sqlite` (messages, tasks, sessions, feedback, prompt versions)
- [x] Container runner (`src/container-runner.ts` — Docker, mount security, secrets handling)
- [x] Agent runner in container (`container/agent-runner/agent.ts` — Claude SDK + structured output)
- [x] Structured agent output format (`AgentOutputSchema` — status, priority, summary, needsReview)
- [x] Priority queue with concurrency control (`src/queue.ts`)
- [x] IPC event bus for conductor communication (`src/ipc.ts`)
- [x] All six conductor skeletons with IPC integration
- [x] 23 passing unit tests

## Phase 1.5: GUI — Web Interface ✅
- [x] HTTP API server integrated in host process (`src/server.ts`)
- [x] WebSocket for real-time events (IPC bus → browser)
- [x] React + Vite + Tailwind frontend (`web/`)
- [x] Dashboard page (task stats, message counts, review counts)
- [x] Inbox page (messages by status, expandable detail view)
- [x] Drafts page (agent outputs, approve/reject workflow)
- [x] Notes page (manual input: call notes, case references)
- [x] Activity page (real-time event stream via WebSocket)
- [x] Settings page (channels, data sources, agents — placeholder)
- [x] Full API: GET/POST messages, tasks, notes, status
- [x] Cross-platform: runs on Windows, macOS, Linux via `npm run dev`

## Phase 2: First Channel — Email
- [ ] Email channel adapter (Gmail API / IMAP)
- [ ] Incoming email processing and storage
- [ ] Outgoing email (reply, compose)
- [ ] Thread/conversation context tracking
- [ ] Basic email triage (Inbox Conductor — rule-based)

## Phase 3: Vector Store + Context
- [ ] sqlite-vec integration for embedding storage
- [ ] Embedding generation for messages and notes
- [ ] Context Conductor: semantic search for relevant past conversations
- [ ] Learning Conductor: correction embeddings for few-shot prompt injection

## Phase 4: Knowledge Sources
- [ ] Knowledge Source interface (pluggable data connectors)
- [ ] WordPress adapter (REST API, WP-CLI, MCP)
- [ ] CRM adapter skeleton
- [ ] Context Conductor: enrich agent context with external data

## Phase 5: Approval Workflows
- [ ] Draft mode (agent creates draft, human confirms via GUI)
- [ ] Auto-approve rules (pattern matching for routine responses)
- [ ] Escalation logic (uncertainty detection → route to human)
- [ ] Review queue with priority sorting in Drafts page

## Phase 6: Learning Loop
- [ ] Track MA corrections (original → edited pairs)
- [ ] Prompt versioning with A/B testing
- [ ] Learning Conductor: suggest prompt improvements from patterns
- [ ] Feedback-driven quality metrics per prompt version

## Phase 7: Self-Modification Engine
- [ ] Architect Agent (code generation, testing, commit)
- [ ] Git integration (auto-commit, push to user's repo)
- [ ] "Connect WordPress" flow via GUI → generates adapter code
- [ ] Test runner for generated code
- [ ] Restart mechanism after code changes
- [ ] Rollback on failure (git revert)

## Phase 8: Additional Channels
- [ ] Microsoft Teams adapter
- [ ] Slack adapter
- [ ] Google Chat adapter
- [ ] Webhook/API adapter (generic inbound/outbound)
- [ ] Ticketing system adapter (Jira, Zendesk — via skills)

## Phase 9: Advanced Features
- [ ] Multi-user auth and roles (MA, Team Lead, Admin)
- [ ] RAG integration (Context Conductor with vector DB)
- [ ] Multi-tenant support (multiple teams/departments)
- [ ] Audit logging (who, when, which prompt version, which data)
- [ ] Agent-to-agent coordination via conductors
- [ ] Compliance conductor (industry-specific rules)

## Future Considerations
- [ ] Consumer channel skills (WhatsApp, Telegram, Discord — via skills, not core)
- [ ] Voice channel support
- [ ] Mobile companion app
- [ ] Self-hosted vs. cloud deployment options
- [ ] Cloudflare Workers / Vercel deployment
