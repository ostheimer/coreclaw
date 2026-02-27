/**
 * Types for the approval workflow system.
 * Flow: Agent creates draft → Quality Conductor reviews → Human approves/edits/rejects → Send or Learn
 */

export type DraftStatus = "pending_review" | "approved" | "rejected" | "sent" | "edited_and_sent" | "auto_approved";

export interface Draft {
  id: string;
  taskId: string;
  sourceMessageId: string | null;
  channel: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  originalBody: string;
  status: DraftStatus;
  priority: "low" | "normal" | "high" | "urgent";
  conductorNotes: string | null;
  qualityScore: number | null;
  qualityNotes: string | null;
  autoApproveMatch: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  sentAt: Date | null;
  externalDraftId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Correction {
  id: string;
  draftId: string;
  taskId: string;
  originalBody: string;
  editedBody: string;
  editedSubject: string | null;
  changeType: "minor_edit" | "major_rewrite" | "tone_change" | "factual_fix" | "rejection";
  feedback: string | null;
  createdAt: Date;
}

export interface ApprovalRule {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  conditions: RuleCondition[];
  action: "auto_approve" | "flag_review" | "escalate";
  createdAt: Date;
}

export interface RuleCondition {
  field: "channel" | "category" | "priority" | "sender" | "subject" | "quality_score";
  operator: "equals" | "contains" | "greater_than" | "less_than" | "matches";
  value: string;
}

export interface ApprovalStats {
  pendingReview: number;
  approvedToday: number;
  rejectedToday: number;
  autoApprovedToday: number;
  avgQualityScore: number | null;
  correctionsToday: number;
}
