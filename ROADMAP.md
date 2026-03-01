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

## Architektur-Entscheidungen (festgehalten Feb 2026)

### Allgemeinheit — Kein Use-Case-Code im Core
CoreClaw ist generisch. Use-Case-spezifische Logik (WordPress, Rechnungen, Cases) gehört
ausschließlich in Skills/Plugins. Der Core kennt nur generische Konzepte:
- Nachrichten, Aufgaben, Drafts, Korrekturen
- Channels (M365 Email, Teams, Slack, …)
- Skills (externe System-Integrationen)
- Conductors (Chief, Inbox, Quality, Workflow, Context, Learning)

### Persönlichkeits-System (Personality)
Nicht wie NanoClaw (Freitext-CLAUDE.md pro Gruppe), sondern strukturiert und GUI-konfigurierbar:
```
data/personality.json
├── name          — Name des Assistenten (z.B. "CoreClaw", "Alex", …)
├── role          — Rolle in einem Satz (z.B. "Freundlicher Support-Assistent")
├── tone          — Tonalität: formell | professionell | freundlich | locker
├── language      — Standardsprache: de | en | …
├── traits[]      — Charaktereigenschaften (z.B. "präzise", "empathisch")
├── rules[]       — Explizite Verhaltensregeln (z.B. "Immer mit Grußformel schließen")
└── systemPrompt  — Auto-generiert aus den obigen Feldern
```
Ziel: MA kann den "Charakter" über die GUI anpassen, ohne Prompts zu kennen.

### Runtime-Plugin-System (Skills)
Kein Code-Transform-Ansatz wie NanoClaw (`.claude/skills/` + git-merge), sondern
ein **Runtime-Plugin-System** für Büro-MAs ohne Shell-Kenntnisse:
- Skills werden über GUI aktiviert (kein Terminal, kein Git)
- Jeder Skill definiert: Capabilities, Config-Schema (GUI-Wizard), Sandbox-Verhalten
- Skills erhalten durch Aktivierung Zugriff auf externe Systeme
- Vorgefertigte Skills: M365 Email (✅), WordPress, Google Drive, Dropbox, OneDrive, …
- Benutzerdefinierte Skills: via Architect Agent generiert (Phase 8)

### Betriebsmodi (Operation Modes)
NanoClaw hat keine formalen Modi — CoreClaw schon:

| Modus | Beschreibung |
|-------|-------------|
| **Sandbox** | Nur lesen. Dry-Run: protokolliert was er tun *würde*, ohne es zu tun. Beobachtet MA-Verhalten und sammelt Muster. |
| **Vorschlag** | Erstellt Drafts zur MA-Prüfung. Skills können gelesen werden, aber noch nicht schreiben. |
| **Assistenz** | Routine-Tasks auto-approve, Komplexes zur MA-Prüfung. Skills voll aktiv. |
| **Autonomie** | Alles auto-approve, nur Ausnahmen und Eskalationen zum MA. |

**Sandbox-Spezifikation:**
- Alle Skills implementieren `dryRun(input): Promise<string>` — beschreibt was sie tun würden
- E-Mail-Sync läuft, aber kein Sending, kein Schreiben
- Learning Conductor beobachtet MA-Antworten (Gesendet-Ordner) und vergleicht mit Dry-Run-Output
- Erkannte Muster → Skill-Vorschläge an Admin: "CoreClaw würde oft WordPress-Cases nachsehen. Soll ich den WordPress-Skill vorschlagen?"

### Channels als Skills (nicht Core)
- M365 Email ist der einzige Built-in Channel (Referenz-Implementation)
- Microsoft Teams, Slack, Google Chat, Webhook → Skills
- Consumer-Channels (WhatsApp, Telegram, Discord) → optionale Skills, nicht Core

---

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

## Phase 6: Approval Workflows ✅
- [x] Draft-Tabelle + Corrections-Tabelle in DB (Migration v2)
- [x] Draft Repository: CRUD, Status-Übergänge, Quality-Score, Priority-Sortierung
- [x] Correction Repository: Original vs. bearbeitet, Change-Type-Klassifikation
- [x] Approval Engine (`src/approval/engine.ts`):
  - [x] createDraft() — Agent-Output → Draft mit Source-Message-Kontext
  - [x] approveDraft() — Freigabe durch MA
  - [x] rejectDraft() — Ablehnung mit Begründung (→ Correction)
  - [x] editAndApproveDraft() — Bearbeitung + Freigabe (→ Correction für Learning)
  - [x] autoApproveDraft() — Automatische Freigabe bei Regel-Match
  - [x] Change-Type-Klassifikation: minor_edit, major_rewrite, tone_change, factual_fix, rejection
- [x] Quality Conductor erweitert: Drafts scoren (0-100), Qualitätsnotizen generieren
- [x] Workflow Conductor erweitert: Draft-Erstellung nach Agent-Completion für Email-Typen
- [x] REST API: GET/POST drafts, approve, reject, edit, stats, corrections
- [x] GUI Drafts-Seite komplett neu:
  - [x] Statistik-Leiste (zur Prüfung, freigegeben, abgelehnt, auto-genehmigt, Korrekturen)
  - [x] Review-Queue mit Priority-Sortierung und Quality-Score-Badge
  - [x] Inline-Editor: Betreff + Body bearbeiten, Feedback-Feld für System-Lernen
  - [x] Source-Message-Kontext (ursprüngliche E-Mail anzeigen)
  - [x] Ablehnung mit Pflicht-Begründung
  - [x] Letzte Aktivität (Verlauf bearbeiteter Drafts)
- [x] IPC Events: draft:created, draft:approved, draft:rejected, draft:edited, correction:recorded
- [x] 12 neue Tests (Draft-CRUD, Corrections, Lifecycle), insgesamt 65 Tests

## Phase 7: Learning Loop ✅
- [x] Correction-Analyse: Pattern-Detection pro Agent-Typ (`src/learning/analyzer.ts`)
- [x] Change-Type-Verteilung: minor_edit, major_rewrite, tone_change, factual_fix, rejection
- [x] Prompt-Verbesserungsvorschläge: automatisch generiert aus Korrektur-Mustern
  - Ton-Korrekturen → Ton-Anweisungen im Prompt
  - Umschreibungen → Format/Struktur-Anpassungen
  - Hohe Ablehnungsrate → fundamentale Prompt-Überarbeitung
  - Konfidenz-Bewertung (low/medium/high)
- [x] Prompt-Metriken: usageCount, positiveRating, negativeRating, correctionRate
- [x] Learning Conductor erweitert:
  - Reagiert auf `correction:recorded` Events
  - Buffert Korrekturen, triggert Analyse bei 5+ Korrekturen
  - Periodische Analyse alle 5 Minuten
  - Publiziert `conductor:learning-insight` mit Vorschlägen
- [x] REST API: GET /api/learning/insights, GET /api/learning/suggestions
- [x] GUI Learning-Seite:
  - Prompt-Verbesserungsvorschläge mit Konfidenz-Badge
  - Korrektur-Analyse pro Agent (Korrekturrate, Pattern-Verteilung)
  - MA-Feedback-Anzeige aus Corrections
  - Erklärung des Lernprozesses

## Phase 8: Personality System
- [ ] `data/personality.json` Schema (name, role, tone, language, traits, rules)
- [ ] System-Prompt-Generator aus Personality-Feldern
- [ ] Personality-Seite in GUI (alle Felder bearbeitbar, Live-Vorschau des generierten Prompts)
- [ ] Personality in alle Agent-Aufrufe injizieren (Chief + Quality Conductor)
- [ ] Mehrsprachigkeit: Personality bestimmt Antwortsprache des Agenten
- [ ] REST API: GET/PUT /api/personality

## Phase 9: Sandbox-Modus & Betriebsmodi
- [ ] Globaler Operation-Mode in DB/Config: sandbox | suggest | assist | autonomous
- [ ] Modus-Umschalter in GUI (mit Erklärung was jeder Modus bedeutet)
- [ ] Skill-Interface: `dryRun(input): Promise<DryRunResult>` für alle Skills
- [ ] Sandbox-Log: was CoreClaw getan hätte (pro Nachricht, mit Reasoning)
- [ ] Sandbox-Dashboard: Dry-Run-Protokoll, erkannte Muster, Skill-Vorschläge
- [ ] Beobachtung des Gesendet-Ordners (M365): MA-Antworten vs. Dry-Run vergleichen
- [ ] Learning aus Sandbox-Phase: erkannte Systemzugriffe → Skill-Vorschlag an Admin
- [ ] Modus-basierte Guards in allen Conductors (kein Senden im Sandbox-Modus)

## Phase 10: Runtime-Plugin-System (Skills 2.0)
- [ ] Skill-Interface V2: capabilities[], configSchema (JSON Schema), dryRun(), execute()
- [ ] Skill-Registry: laden, aktivieren, konfigurieren, deaktivieren (Runtime, kein Code-Neustart)
- [ ] Skill-Setup-Wizard-Framework: configSchema → automatisch GUI-Formular generieren
- [ ] Skill: WordPress (REST API — Lesen + Schreiben von Custom Post Types)
- [ ] Skill: Google Drive (Dateien suchen, lesen, hochladen)
- [ ] Skill: OneDrive/SharePoint (Microsoft Graph, Dateien + Listen)
- [ ] Skill: Dropbox (Dateien lesen)
- [ ] Skill: Webhook inbound/outbound (generische HTTP-Integration)
- [ ] Skill: Microsoft Teams (Nachrichten lesen/senden)
- [ ] Skill: Slack
- [ ] Sandbox-Unterstützung: jeder Skill muss dryRun() implementieren

## Phase 11: Architect Agent (Self-Modification)
- [ ] Architect Agent in container (code generation, testing, commit)
- [ ] Git integration (auto-commit, push to user's repo)
- [ ] "Connect WordPress" flow via GUI → generates adapter code as new Skill
- [ ] Test runner for generated code
- [ ] Restart mechanism after code changes
- [ ] Rollback on failure (git revert)

## Phase 12: Channels als Skills

Alle Channels (außer M365 Email als Referenz-Implementation) sind Skills.
Sie implementieren das Channel-Interface und werden über die GUI aktiviert und konfiguriert.

### Business Messenger
- [ ] **Microsoft Teams** — Graph API, Nachrichten lesen/senden, Channel-Kontext
- [ ] **Slack** — Bot Token, Channels + DMs lesen/senden
- [ ] **Google Chat** — Pub/Sub Webhook + REST API, Spaces + DMs
- [ ] **WhatsApp Business** — Meta Cloud API (offizielle Business API, nicht Baileys)
- [ ] **Telegram** — Bot API via `grammy`, Gruppen + DMs

### Ticketing & Support
- [ ] **Jira** — Issues lesen/erstellen/kommentieren
- [ ] **Zendesk** — Tickets lesen/beantworten
- [ ] **Webhook** — generisch inbound/outbound (HTTP)

> **Hinweis WhatsApp:** Persönliches WhatsApp (Baileys) ist ToS-widrig für Business-Einsatz.
> CoreClaw setzt auf die offizielle WhatsApp Business API (Meta Cloud API).
> Telegram ist unkomplizierter — Bot API ohne Einschränkungen für Business-Bots.

## Phase 13: Advanced Features
- [ ] Multi-user auth and roles (MA, Team Lead, Admin)
- [ ] RAG integration (Context Conductor with vector DB)
- [ ] Multi-tenant support (multiple teams/departments)
- [ ] Audit logging (who, when, which prompt version, which data)
- [ ] Agent-to-agent coordination via conductors
- [ ] Compliance conductor (industry-specific rules)

## Future Considerations
- [ ] Voice channel support (Telefon-Transkription → Case-Notizen)
- [ ] Mobile companion app
- [ ] Self-hosted vs. cloud deployment options
- [ ] Cloudflare Workers / Vercel deployment
- [ ] Discord (Community/Gaming, kein Business-Fokus — optionaler Skill)
