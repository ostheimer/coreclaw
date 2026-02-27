<p align="center">
  <strong>CoreClaw</strong>
</p>

<p align="center">
  Business-grade AI agent orchestration. Multiple conductors, structured workflows, container isolation.
</p>

<p align="center">
  <a href="README_de.md">Deutsch</a>&nbsp; • &nbsp;
  <a href="ROADMAP.md">Roadmap</a>&nbsp; • &nbsp;
  <a href="docs/">Documentation</a>
</p>

## Why CoreClaw

AI agents are powerful individually, but running them for business creates a new problem: **agent fatigue** — not the agent getting tired, but *you* getting overwhelmed. You start multiple tasks, each agent runs independently, and suddenly you're the bottleneck: checking outputs, switching context, coordinating results. You become the orchestrator, and that doesn't scale.

Existing projects solve different problems:

- **[NanoClaw](https://github.com/qwibitai/NanoClaw)** is a personal AI assistant — one user, one chat, container-isolated agents. Elegant and secure, but designed for individuals, not teams or business workflows.
- **[OpenClaw](https://github.com/openclaw/openclaw)** is a full platform — every channel, every OS, every feature. Powerful but complex (500k+ lines, 70+ dependencies). Business-specific orchestration isn't its focus.

**CoreClaw** fills the gap: a business-focused orchestration layer for AI agents. Instead of one orchestrator doing everything, CoreClaw introduces **multiple conductors** — specialized roles that manage different aspects of agent work. The human stays in control but stops being the sorter, checker, and summarizer.

## Core Concepts

### Conductors, Not a Single Orchestrator

CoreClaw uses **conductors** (Dirigenten) — specialized orchestration roles that each manage a specific concern:

| Conductor | Role | Responsibility |
|-----------|------|----------------|
| **Chief Conductor** | Oversight | Aggregates status from all conductors, creates briefings, escalates to humans |
| **Inbox Conductor** | Triage | Categorizes incoming messages (email, tickets, chats), routes to the right agent or workflow |
| **Quality Conductor** | Guard rails | Reviews agent outputs before they go out — tone, facts, policy compliance |
| **Workflow Conductor** | Planning | Breaks complex tasks into steps, manages dependencies, merges results |
| **Context Conductor** | Memory | Manages knowledge — past conversations, relevant data, keeps context fresh and relevant |
| **Learning Conductor** | Improvement | Analyzes feedback, tracks patterns, suggests prompt improvements |

Not every conductor is a full agent. Some are host-level logic (e.g., Inbox Conductor as a rule engine), some are agents in containers (e.g., Quality Conductor), some are infrastructure (e.g., Context Conductor as a retrieval layer).

### Business Channels First

CoreClaw prioritizes the channels businesses actually use:

- **Email** (Gmail, Outlook/Exchange) — the universal business channel
- **Microsoft Teams** — enterprise chat and collaboration
- **Slack** — team communication, integrations
- **Google Chat** — Google Workspace organizations
- **Ticketing systems** (Jira, Zendesk, Freshdesk) — support and project management
- **Webhooks / APIs** — system-to-system communication

Consumer channels (WhatsApp, Telegram, Discord) are not in scope for the core but can be added via skills.

### Container Isolation

Like NanoClaw, all agents run in **containers** (Docker). They can only see what's explicitly mounted. Bash commands run inside the container, not on your host. This is OS-level isolation, not application-level permission checks.

### Structured Agent Output

Agents don't just return free text. They return structured results:

```json
{
  "status": "completed",
  "priority": "normal",
  "summary": "Answered 3 support emails, 1 escalated to human",
  "needsReview": false,
  "outputs": [...],
  "metadata": { "tokens": 4200, "duration_ms": 12000 }
}
```

This enables the Chief Conductor to aggregate, the Quality Conductor to review, and the dashboard to display — without the human reading every raw output.

### Approval Workflows

Not everything should go out automatically. CoreClaw supports:

- **Auto-approve** — routine responses that match established patterns
- **Draft → Review → Send** — agent creates a draft, human confirms with one action
- **Escalation** — agent recognizes uncertainty and routes to a human instead of guessing

## Architecture

```
                         ┌──────────────────┐
                         │   Chief Conductor │  → Briefings, escalation
                         └────────┬─────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                       ▼
  ┌─────────────────┐   ┌─────────────────┐    ┌─────────────────┐
  │ Inbox Conductor  │   │ Workflow Cond.   │    │ Quality Cond.   │
  │ (triage)         │   │ (plan & merge)   │    │ (guard rails)   │
  └────────┬────────┘   └────────┬────────┘    └────────┬────────┘
           │                     │                       │
           ▼                     ▼                       ▼
      ┌─────────┐         ┌───────────┐           ┌───────────┐
      │ Agent A  │         │ Agent B+C │           │ Review    │
      │ (email)  │         │ (parallel)│           │ output    │
      └─────────┘         └───────────┘           └───────────┘
           │                     │                       │
           └─────────────────────┴───────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      Context Conductor     │  → RAG, history, relevant data
                    │      Learning Conductor    │  → Feedback, prompt improvement
                    └───────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `src/index.ts` | Host process: channels, queue, conductor coordination |
| `src/conductors/` | Conductor implementations (chief, inbox, quality, workflow, context, learning) |
| `src/channels/` | Channel adapters (email, teams, slack, google-chat, webhooks) |
| `src/queue.ts` | Task queue with priority, concurrency limits, retry logic |
| `src/container-runner.ts` | Spawns agent containers with mounts and secrets |
| `src/db.ts` | SQLite: messages, tasks, sessions, feedback, prompt versions |
| `container/agent-runner/` | In-container agent logic (Claude Agent SDK) |
| `conductors/{name}/` | Per-conductor configuration and memory |

### Data Flow (Example: Incoming Email)

1. **Email arrives** → Channel adapter stores in DB
2. **Inbox Conductor** triages: category, priority, relevant context needed
3. **Context Conductor** retrieves: past conversations, customer data, relevant docs
4. **Workflow Conductor** decides: simple (one agent) or complex (multi-step)
5. **Agent(s)** execute in container(s), return structured output
6. **Quality Conductor** reviews: tone, accuracy, policy — approves, corrects, or escalates
7. **Chief Conductor** updates dashboard: "3 handled, 1 needs your review"
8. **Learning Conductor** logs: what worked, what was corrected, pattern analysis

## Getting Started

### Requirements

- macOS or Linux
- Node.js 22+
- Docker
- [Claude Code](https://claude.ai/download) (for setup and customization)

### Quick Start

```bash
git clone https://github.com/ostheimer/coreclaw.git
cd coreclaw
claude
```

Then run `/setup`. Claude Code guides you through: dependencies, container build, channel configuration, and conductor setup.

### Configuration

CoreClaw uses minimal configuration. Business-specific behavior lives in conductor rules and prompt files, not in sprawling config objects.

```
.env                          # Secrets (API keys, tokens)
conductors/chief/rules.md     # Chief conductor instructions
conductors/inbox/rules.md     # Triage rules and routing
conductors/quality/rules.md   # Output quality standards
prompts/                      # Versioned prompt templates
```

## Customization

Like NanoClaw, CoreClaw is designed to be customized via code changes and skills:

- "Add Jira as a ticket source" → `/add-jira`
- "Change the approval workflow for support emails" → modify conductor rules
- "Add a new conductor for compliance" → create a new conductor module

The codebase stays small enough that Claude Code can safely modify it.

## What Sets CoreClaw Apart

| | NanoClaw | OpenClaw | CoreClaw |
|---|---------|----------|----------|
| **Focus** | Personal assistant | Universal platform | Business orchestration |
| **Channels** | WhatsApp, Telegram | Everything (15+) | Email, Teams, Slack, Tickets |
| **Orchestration** | One queue, one agent per group | Gateway + sessions | Multiple conductors with roles |
| **Agent isolation** | Always containerized | Host default, optional sandbox | Always containerized |
| **Output format** | Free text | Free text | Structured (status, priority, review flag) |
| **Approval workflow** | None | None | Draft → Review → Send, auto-approve rules |
| **Agent coordination** | Within group (swarms) | Session-to-session messaging | Cross-agent via conductors + shared results |
| **Prompt management** | CLAUDE.md files | AGENTS.md + workspace | Versioned prompts with feedback loop |
| **Quality control** | None | None | Quality Conductor (guard rails) |
| **Dashboard** | Chat only | Control UI | Unified inbox with status and priorities |
| **Codebase** | ~10k lines | ~500k lines | Target: ~15–20k lines |

## Philosophy

**Business-first.** Channels, workflows, and defaults are chosen for business use cases, not personal assistants or developer tools.

**Multiple conductors, not one orchestrator.** Each concern (triage, quality, planning, memory, learning) has its own conductor with clear responsibilities. The human decides; the system sorts, checks, and summarizes.

**Structured over free-form.** Agent outputs have shape. Dashboards work because data is structured. Approval workflows work because outputs have review flags.

**Small enough to understand.** Like NanoClaw, the codebase should be readable. The target is 15–20k lines of TypeScript, not a platform with hundreds of thousands.

**Secure by isolation.** Agents run in containers. Always. No exceptions.

**Prompt improvement is a first-class concern.** Prompts aren't static files you set and forget. They're versioned, measured, and improved based on feedback.

## Inspiration and Attribution

CoreClaw builds on ideas and patterns from:

- **[NanoClaw](https://github.com/qwibitai/NanoClaw)** — container isolation, single-process architecture, skills-over-features philosophy
- **[OpenClaw](https://github.com/openclaw/openclaw)** — channel abstraction, session model, multi-channel architecture

## License

MIT
