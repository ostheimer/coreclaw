# Initial Prompt for CoreClaw

Use this as the first message when opening the project in Cursor or Claude Code.

---

CoreClaw is a business-grade AI agent orchestration system. The README, README_de and ROADMAP are already in the repo. Read them first.

The project is inspired by NanoClaw (https://github.com/qwibitai/NanoClaw) and OpenClaw (https://github.com/openclaw/openclaw). NanoClaw is the closer reference for architecture, it is about 10k lines of TypeScript, single Node.js process, agents always run in Docker containers, uses Claude Agent SDK inside the container. OpenClaw is the big platform with 500k lines, 15+ channels, runs agents on the host by default.

CoreClaw takes the best from both but focuses on business use cases.

The core idea is multiple conductors (Dirigenten) instead of a single orchestrator. The problem we solve is agent fatigue for the human, meaning you start multiple agents and tasks, they all run independently, and you become the bottleneck checking outputs, switching context, coordinating results. CoreClaw solves this with specialized conductor roles.

The six conductor roles are: Chief Conductor (overview, briefings, escalation to human), Inbox Conductor (triage incoming messages, categorize, route to right agent), Quality Conductor (review agent outputs before sending, tone, facts, policy), Workflow Conductor (break complex tasks into steps, manage dependencies, merge results), Context Conductor (manage knowledge, past conversations, relevant data, RAG), Learning Conductor (analyze feedback, track patterns, improve prompts).

Not every conductor needs to be a full agent in a container. Some are host-level logic like the Inbox Conductor as a rule engine. Some are agents like the Quality Conductor. Some are infrastructure like the Context Conductor as a retrieval layer.

Business channels first: Email (Gmail, Outlook/Exchange), Microsoft Teams, Slack, Google Chat, ticketing systems (Jira, Zendesk), webhooks and APIs. Consumer channels like WhatsApp or Telegram are not in scope for the core but can be added via skills.

Key technical decisions: TypeScript and Node.js like NanoClaw. Single host process. Agents always in Docker containers. SQLite for persistence. Claude Agent SDK inside containers. Structured agent output with status, priority, summary, needsReview flag, not just free text. Approval workflows with auto-approve for routine, draft-review-send for important, escalation when uncertain.

The codebase target is 15-20k lines of TypeScript. Small enough to understand, like NanoClaw.

Project language: code and documentation in English. First translation German. Comments in code always English. Answers to the user always in German.

Next steps: create the project scaffolding (package.json, tsconfig.json, directory structure for src, src/conductors, src/channels, container, conductors, prompts), then CLAUDE.md for Claude Code integration, then start Phase 1 from the ROADMAP (core infrastructure: host process, DB schema, container runner, agent runner, structured output, queue, IPC).

The repo is at https://github.com/ostheimer/coreclaw and the README, README_de, ROADMAP and gitignore are already committed.
