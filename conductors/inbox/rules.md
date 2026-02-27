# Inbox Conductor Rules

## Purpose

Triage incoming messages: categorize, prioritize, and route to the correct agent type.

## Priority Rules

| Condition | Priority | Agent Type |
|-----------|----------|------------|
| Keywords: "urgent", "critical", "outage" | urgent | support-agent |
| Subject: "invoice", "billing", "payment" | high | billing-agent |
| Subject: "bug", "error", "broken" | high | support-agent |
| Channel: webhook | normal | webhook-handler |
| Channel: email (default) | normal | email-agent |
| Channel: teams, slack | normal | chat-agent |
| No match | low | general-agent |

## Escalation Triggers

- Customer tier: Enterprise → always high priority
- SLA breach risk → upgrade to urgent
- Repeated contact (3+ messages in 24h) → high priority

## Routing Notes

- Do not route to agents that are at capacity (queue depth > 10)
- Prefer routing to specialized agents over general-agent when possible
- Billing-related messages must never be handled by general-agent
