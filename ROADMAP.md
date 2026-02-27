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

## Phase 2: First Channel — Email
- [ ] Email channel adapter (Gmail API / IMAP)
- [ ] Incoming email processing and storage
- [ ] Outgoing email (reply, compose)
- [ ] Thread/conversation context tracking
- [ ] Basic email triage (Inbox Conductor — rule-based)

## Phase 3: Conductor Framework
- [x] Conductor interface and base implementation (`BaseConductor`)
- [x] Inbox Conductor (triage, categorize, route — rule-based)
- [x] Quality Conductor (output review, guard rails — host-level)
- [x] Chief Conductor (status aggregation, briefings, escalation)
- [x] Workflow Conductor (multi-step task planning, parallel steps)
- [x] Context Conductor (thread history retrieval)
- [x] Learning Conductor (feedback collection, prompt metric tracking)
- [ ] Full agent-based Quality Conductor (container execution for complex review)
- [ ] RAG integration for Context Conductor
- [ ] Prompt improvement suggestions from Learning Conductor

## Phase 4: Approval Workflows
- [ ] Draft mode (agent creates draft, human confirms)
- [ ] Auto-approve rules (pattern matching for routine responses)
- [ ] Escalation logic (uncertainty detection → route to human)
- [ ] Review queue (pending approvals with priority)

## Phase 5: Dashboard / Unified Inbox
- [ ] CLI dashboard (task status, agent outputs, pending reviews)
- [ ] Web UI (unified inbox with filtering, priorities, approval actions)
- [ ] Status API for external integrations

## Phase 6: Additional Channels
- [ ] Microsoft Teams adapter
- [ ] Slack adapter
- [ ] Google Chat adapter
- [ ] Webhook/API adapter (generic inbound/outbound)
- [ ] Ticketing system adapter (Jira, Zendesk — via skills)

## Phase 7: Prompt Management
- [ ] Prompt versioning (DB-backed, with activation timestamps) — schema ready
- [ ] A/B prompt testing framework
- [ ] Feedback-driven prompt improvement (Learning Conductor)
- [ ] Prompt performance metrics (response quality, correction rate) — schema ready

## Phase 8: Advanced Features
- [ ] RAG integration (Context Conductor with vector DB)
- [ ] Multi-tenant support (multiple teams/departments)
- [ ] Audit logging (who, when, which prompt version, which data)
- [ ] Agent-to-agent coordination (shared results, cross-conductor communication)
- [ ] Compliance conductor (industry-specific rules)

## Future Considerations
- [ ] Consumer channel skills (WhatsApp, Telegram, Discord — via skills, not core)
- [ ] Voice channel support
- [ ] Mobile companion app
- [ ] Self-hosted vs. cloud deployment options
