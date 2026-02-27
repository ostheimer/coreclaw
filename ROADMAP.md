# CoreClaw Roadmap

## Phase 0: Foundation (current)
- [x] Repository created
- [x] README (English + German)
- [x] Roadmap
- [ ] Project scaffolding (package.json, tsconfig, directory structure)
- [ ] CLAUDE.md for Claude Code integration
- [ ] Basic `.claude/skills/setup/SKILL.md`

## Phase 1: Core Infrastructure
- [ ] Single Node.js host process (`src/index.ts`)
- [ ] SQLite database schema (messages, tasks, sessions, feedback, prompt versions)
- [ ] Container runner (Docker, mount security, secrets via stdin)
- [ ] Agent runner in container (Claude Agent SDK integration)
- [ ] Structured agent output format (status, priority, summary, needsReview)
- [ ] Basic queue with concurrency control
- [ ] IPC (host ↔ container communication)

## Phase 2: First Channel — Email
- [ ] Email channel adapter (Gmail API / IMAP)
- [ ] Incoming email processing and storage
- [ ] Outgoing email (reply, compose)
- [ ] Thread/conversation context tracking
- [ ] Basic email triage (Inbox Conductor — rule-based)

## Phase 3: Conductor Framework
- [ ] Conductor interface and base implementation
- [ ] Inbox Conductor (triage, categorize, route)
- [ ] Quality Conductor (output review, guard rails)
- [ ] Chief Conductor (status aggregation, briefings)
- [ ] Workflow Conductor (multi-step task planning)
- [ ] Context Conductor (relevant data retrieval)
- [ ] Learning Conductor (feedback collection, prompt improvement suggestions)

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
- [ ] Prompt versioning (DB-backed, with activation timestamps)
- [ ] A/B prompt testing framework
- [ ] Feedback-driven prompt improvement (Learning Conductor)
- [ ] Prompt performance metrics (response quality, correction rate)

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
