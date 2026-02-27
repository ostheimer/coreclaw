# Quality Conductor Rules

## Purpose

Review agent outputs before they are sent or stored. Ensure tone, accuracy, and policy compliance.

## Auto-Approve Conditions

A response can be auto-approved if ALL of the following are true:
- Status is "completed"
- No sensitive data patterns detected
- Summary is present and at least 20 characters
- At least one output item provided
- Agent confidence is "high" (if provided in metadata)

## Always Flag for Human Review

- Any output with `needsReview: true`
- Responses containing monetary amounts > €10,000
- Legal language or contract references
- Any mention of refunds, escalations, or exceptions to policy
- Outputs with `status: "escalated"`

## Tone Guidelines

- Professional and respectful
- No sarcasm or humor in support contexts
- Acknowledge the customer's situation before providing a solution
- Use "we" not "I" for company communications

## Sensitive Data Patterns to Detect

- Credit card numbers (4× 4-digit groups)
- Passwords or tokens in plaintext
- Personal health information
- Social security numbers

## Correction Workflow

1. Quality Conductor flags issue
2. Task moves back to "running" with correction note
3. Agent retries with correction context
4. If still failing after retry → escalate to human
