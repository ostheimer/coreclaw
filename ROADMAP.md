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

## Phase 2: Skills Engine ✅
- [x] Skill type system + Zod manifest schema (`src/skills/types.ts`)
- [x] State management in `.coreclaw/` directory (`src/skills/state.ts`)
- [x] Manifest validation + available skills listing (`src/skills/manifest.ts`)
- [x] Atomic backup/restore for safe apply/uninstall (`src/skills/backup.ts`)
- [x] Three-way merge using `git merge-file` (NanoClaw pattern) (`src/skills/merge.ts`)
- [x] Apply engine: add files, merge modifications, npm deps, env vars, post-apply hooks (`src/skills/apply.ts`)
- [x] Uninstall engine: remove added files, restore modified files (`src/skills/uninstall.ts`)
- [x] Pre-flight validation: dependency checks, conflict detection, duplicate prevention
- [x] REST API: GET/POST skills, apply, uninstall (`src/server.ts`)
- [x] GUI: Skills page with install/uninstall, status display (`web/src/pages/Skills.tsx`)
- [x] First skill template: WordPress Adapter (`skills/wordpress-adapter/`)
- [x] Second skill template: Webhook Channel (`skills/webhook-channel/`)
- [x] Knowledge Source interface for pluggable data connectors
- [x] 13 unit tests for skills engine (manifest, state, backup, apply/uninstall lifecycle)

## Phase 3: First Channel — Microsoft 365 Email ✅
- [x] Microsoft Graph API client mit MSAL-Authentifizierung (`src/channels/email/graph-client.ts`)
- [x] Application Permissions Flow (Client Credentials — kein Browser-Login nötig)
- [x] Delta Query Sync-Engine — inkrementelle Synchronisation (`src/channels/email/sync.ts`)
- [x] E-Mail lesen, senden, antworten, Entwürfe erstellen
- [x] Verschlüsselter Config Store für Zugangsdaten (`src/channels/email/config-store.ts`)
- [x] Setup-Wizard API: test, mailboxes, folders, save, start/stop (`src/server.ts`)
- [x] Setup-Wizard GUI: 6-Schritte-Assistent mit Azure AD Anleitung (`web/src/pages/EmailSetup.tsx`)
- [x] Konfigurierte Ansicht: Sync-Status, Start/Stop, Statistiken
- [x] Inbox Conductor erweitert: DE/EN Keyword-Triage für E-Mails (urgent, billing, bug, escalation, reply)
- [x] Auto-Start: E-Mail-Sync startet automatisch wenn gespeicherte Konfiguration vorhanden
- [x] Thread-Tracking via Microsoft Graph `conversationId`
- [x] 11 neue Tests (Config-Verschlüsselung, Triage-Regeln), insgesamt 53 Tests

## Phase 4: Vector Store + Context
- [ ] sqlite-vec integration for embedding storage
- [ ] Embedding generation for messages and notes
- [ ] Context Conductor: semantic search for relevant past conversations
- [ ] Learning Conductor: correction embeddings for few-shot prompt injection

## Phase 5: Knowledge Sources
- [ ] WordPress adapter activation via GUI (install skill)
- [ ] CRM adapter skill skeleton
- [ ] Context Conductor: enrich agent context with external data
- [ ] Knowledge Source registry (auto-discover installed sources)

## Phase 6: Approval Workflows
- [ ] Draft mode (agent creates draft, human confirms via GUI)
- [ ] Auto-approve rules (pattern matching for routine responses)
- [ ] Escalation logic (uncertainty detection → route to human)
- [ ] Review queue with priority sorting in Drafts page

## Phase 7: Learning Loop
- [ ] Track MA corrections (original → edited pairs)
- [ ] Prompt versioning with A/B testing
- [ ] Learning Conductor: suggest prompt improvements from patterns
- [ ] Feedback-driven quality metrics per prompt version

## Phase 8: Architect Agent (Self-Modification)
- [ ] Architect Agent in container (code generation, testing, commit)
- [ ] Git integration (auto-commit, push to user's repo)
- [ ] "Connect WordPress" flow via GUI → generates adapter code as skill
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
