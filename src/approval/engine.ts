import { randomUUID } from "crypto";
import { draftRepo, correctionRepo, messageRepo } from "../db.js";
import { ipcBus } from "../ipc.js";
import type { Draft, Correction, ApprovalStats } from "./types.js";
import type { Task, AgentOutput } from "../types.js";

/**
 * Approval Engine — manages the draft lifecycle.
 *
 * Flow:
 * 1. Agent completes task → createDraft() stores the proposed response
 * 2. Quality Conductor reviews → updateQuality() adds score + notes
 * 3. Auto-approve rules checked → if match, auto-approve and send
 * 4. Otherwise → draft sits in review queue for human
 * 5. Human approves/edits/rejects in GUI
 * 6. If edited → correction recorded for Learning Conductor
 * 7. Approved drafts are sent via the channel adapter
 */

export function createDraft(
  task: Task,
  output: AgentOutput,
  channel: string = "email",
): Draft {
  const emailOutput = output.outputs.find((o) => o.type === "email" || o.type === "reply" || o.type === "draft");
  const body = emailOutput?.content ?? output.summary;

  const sourceMessage = task.sourceMessageId ? messageRepo.findById(task.sourceMessageId) : null;

  const draft = draftRepo.insert({
    id: randomUUID(),
    taskId: task.id,
    sourceMessageId: task.sourceMessageId ?? null,
    channel,
    to: sourceMessage ? [sourceMessage.from] : [],
    cc: [],
    subject: sourceMessage?.subject
      ? (sourceMessage.subject.startsWith("Re:") ? sourceMessage.subject : `Re: ${sourceMessage.subject}`)
      : output.summary.slice(0, 80),
    body,
    originalBody: body,
    status: "pending_review",
    priority: output.priority as Draft["priority"],
    conductorNotes: null,
    qualityScore: null,
    qualityNotes: null,
    autoApproveMatch: null,
    reviewedBy: null,
    reviewedAt: null,
    sentAt: null,
    externalDraftId: null,
    metadata: {
      agentType: task.type,
      taskPayload: task.payload,
      outputMetadata: output.metadata,
      needsReview: output.needsReview,
    },
  });

  ipcBus.publish("draft:created", "approval-engine", {
    draft,
    task,
    needsReview: output.needsReview,
  });

  console.log(`[approval] Draft ${draft.id} created for task ${task.id} (${channel})`);
  return draft;
}

export function approveDraft(draftId: string, reviewedBy: string = "user"): Draft | null {
  const draft = draftRepo.findById(draftId);
  if (!draft || draft.status !== "pending_review") return null;

  draftRepo.updateStatus(draftId, "approved", reviewedBy);

  ipcBus.publish("draft:approved", "approval-engine", { draftId, reviewedBy });
  console.log(`[approval] Draft ${draftId} approved by ${reviewedBy}`);

  return draftRepo.findById(draftId);
}

export function rejectDraft(draftId: string, reason: string, reviewedBy: string = "user"): Draft | null {
  const draft = draftRepo.findById(draftId);
  if (!draft || draft.status !== "pending_review") return null;

  draftRepo.updateStatus(draftId, "rejected", reviewedBy);

  // Record as correction (rejection type)
  correctionRepo.insert({
    id: randomUUID(),
    draftId: draft.id,
    taskId: draft.taskId,
    originalBody: draft.originalBody,
    editedBody: "",
    editedSubject: null,
    changeType: "rejection",
    feedback: reason,
  });

  ipcBus.publish("draft:rejected", "approval-engine", { draftId, reason, reviewedBy });
  console.log(`[approval] Draft ${draftId} rejected by ${reviewedBy}: ${reason}`);

  return draftRepo.findById(draftId);
}

export function editAndApproveDraft(
  draftId: string,
  editedBody: string,
  editedSubject: string | null,
  feedback: string | null,
  reviewedBy: string = "user",
): Draft | null {
  const draft = draftRepo.findById(draftId);
  if (!draft || draft.status !== "pending_review") return null;

  // Determine change type by comparing original vs edited
  const changeType = classifyChange(draft.originalBody, editedBody);

  // Update the draft body
  draftRepo.updateBody(draftId, editedBody, editedSubject ?? undefined);
  draftRepo.updateStatus(draftId, "edited_and_sent", reviewedBy);

  // Record the correction for learning
  correctionRepo.insert({
    id: randomUUID(),
    draftId: draft.id,
    taskId: draft.taskId,
    originalBody: draft.originalBody,
    editedBody,
    editedSubject,
    changeType,
    feedback,
  });

  ipcBus.publish("draft:edited", "approval-engine", {
    draftId,
    changeType,
    reviewedBy,
    hasCorrection: true,
  });

  ipcBus.publish("correction:recorded", "learning", {
    draftId: draft.id,
    taskId: draft.taskId,
    changeType,
    originalLength: draft.originalBody.length,
    editedLength: editedBody.length,
  });

  console.log(`[approval] Draft ${draftId} edited (${changeType}) and approved by ${reviewedBy}`);

  return draftRepo.findById(draftId);
}

export function markDraftSent(draftId: string, externalDraftId?: string): void {
  const db = draftRepo.findById(draftId);
  if (!db) return;

  if (db.status === "approved" || db.status === "auto_approved") {
    draftRepo.updateStatus(draftId, "sent");
  }

  ipcBus.publish("draft:sent", "approval-engine", { draftId, externalDraftId });
}

export function autoApproveDraft(draftId: string, matchedRule: string): Draft | null {
  const draft = draftRepo.findById(draftId);
  if (!draft || draft.status !== "pending_review") return null;

  draftRepo.updateStatus(draftId, "auto_approved");

  ipcBus.publish("draft:auto_approved", "approval-engine", { draftId, matchedRule });
  console.log(`[approval] Draft ${draftId} auto-approved (rule: ${matchedRule})`);

  return draftRepo.findById(draftId);
}

// ---------- Stats ----------

export function getApprovalStats(): ApprovalStats {
  const counts = draftRepo.countByStatus();
  const corrections = correctionRepo.countToday();

  return {
    pendingReview: counts["pending_review"] ?? 0,
    approvedToday: (counts["approved"] ?? 0) + (counts["sent"] ?? 0) + (counts["edited_and_sent"] ?? 0),
    rejectedToday: counts["rejected"] ?? 0,
    autoApprovedToday: counts["auto_approved"] ?? 0,
    avgQualityScore: null,
    correctionsToday: corrections,
  };
}

// ---------- Helpers ----------

function classifyChange(original: string, edited: string): Correction["changeType"] {
  if (!edited || edited.trim() === "") return "rejection";

  const originalWords = original.toLowerCase().split(/\s+/);
  const editedWords = edited.toLowerCase().split(/\s+/);
  const totalWords = Math.max(originalWords.length, editedWords.length);

  // Count different words (simple diff metric)
  const originalSet = new Set(originalWords);
  const editedSet = new Set(editedWords);
  let changedCount = 0;
  for (const w of editedSet) {
    if (!originalSet.has(w)) changedCount++;
  }
  for (const w of originalSet) {
    if (!editedSet.has(w)) changedCount++;
  }

  const changeRatio = changedCount / (totalWords * 2);

  if (changeRatio > 0.5) return "major_rewrite";
  if (changeRatio > 0.2) return "tone_change";
  return "minor_edit";
}
