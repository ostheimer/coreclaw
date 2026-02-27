/**
 * Tests for the approval workflow: draft lifecycle, corrections, quality scoring.
 */
import { randomUUID } from "crypto";
import { getDb, closeDb, draftRepo, correctionRepo } from "../db.js";
import type { Draft, DraftStatus } from "../approval/types.js";

beforeAll(() => {
  process.env["DB_PATH"] = ":memory:";
  getDb();
});

afterAll(() => {
  closeDb();
});

describe("Draft Repository", () => {
  it("inserts and retrieves a draft", () => {
    const draft = draftRepo.insert({
      id: randomUUID(),
      taskId: "task-1",
      sourceMessageId: "msg-1",
      channel: "email",
      to: ["customer@example.com"],
      cc: [],
      subject: "Re: Support-Anfrage",
      body: "Vielen Dank für Ihre Nachricht...",
      originalBody: "Vielen Dank für Ihre Nachricht...",
      status: "pending_review",
      priority: "normal",
      conductorNotes: null,
      qualityScore: null,
      qualityNotes: null,
      autoApproveMatch: null,
      reviewedBy: null,
      reviewedAt: null,
      sentAt: null,
      externalDraftId: null,
      metadata: { agentType: "email-agent" },
    });

    expect(draft.id).toBeDefined();
    expect(draft.subject).toBe("Re: Support-Anfrage");
    expect(draft.status).toBe("pending_review");
    expect(draft.to).toEqual(["customer@example.com"]);
    expect(draft.createdAt).toBeInstanceOf(Date);

    const found = draftRepo.findById(draft.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(draft.id);
  });

  it("finds drafts by status", () => {
    const id1 = randomUUID();
    const id2 = randomUUID();

    draftRepo.insert(makeDraft(id1, "pending_review"));
    draftRepo.insert(makeDraft(id2, "approved"));

    const pending = draftRepo.findByStatus("pending_review");
    expect(pending.some((d) => d.id === id1)).toBe(true);

    const approved = draftRepo.findByStatus("approved");
    expect(approved.some((d) => d.id === id2)).toBe(true);
  });

  it("updates draft status with reviewer info", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "pending_review"));

    draftRepo.updateStatus(draft.id, "approved", "admin");
    const updated = draftRepo.findById(draft.id)!;

    expect(updated.status).toBe("approved");
    expect(updated.reviewedBy).toBe("admin");
    expect(updated.reviewedAt).toBeInstanceOf(Date);
  });

  it("updates draft body and subject", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "pending_review"));

    draftRepo.updateBody(draft.id, "Neuer Text", "Neuer Betreff");
    const updated = draftRepo.findById(draft.id)!;

    expect(updated.body).toBe("Neuer Text");
    expect(updated.subject).toBe("Neuer Betreff");
    expect(updated.originalBody).toBe("Original draft body");
  });

  it("updates quality score", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "pending_review"));

    draftRepo.updateQuality(draft.id, 85, "Qualität: 85/100 — Keine Beanstandungen");
    const updated = draftRepo.findById(draft.id)!;

    expect(updated.qualityScore).toBe(85);
    expect(updated.qualityNotes).toContain("85/100");
  });

  it("counts drafts by status", () => {
    const counts = draftRepo.countByStatus();
    expect(typeof counts).toBe("object");
    expect(counts["pending_review"]).toBeGreaterThanOrEqual(0);
  });

  it("finds pending review drafts sorted by priority", () => {
    const urgentId = randomUUID();
    const normalId = randomUUID();

    draftRepo.insert({ ...makeDraft(normalId, "pending_review"), priority: "normal" });
    draftRepo.insert({ ...makeDraft(urgentId, "pending_review"), priority: "urgent" });

    const pending = draftRepo.findPendingReview();
    const urgentIdx = pending.findIndex((d) => d.id === urgentId);
    const normalIdx = pending.findIndex((d) => d.id === normalId);

    if (urgentIdx !== -1 && normalIdx !== -1) {
      expect(urgentIdx).toBeLessThan(normalIdx);
    }
  });
});

describe("Correction Repository", () => {
  it("records a correction", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "pending_review"));

    const correction = correctionRepo.insert({
      id: randomUUID(),
      draftId: draft.id,
      taskId: draft.taskId,
      originalBody: "Original draft body",
      editedBody: "Bearbeiteter Text mit Korrekturen",
      editedSubject: null,
      changeType: "minor_edit",
      feedback: "Ton war zu formell",
    });

    expect(correction.id).toBeDefined();
    expect(correction.changeType).toBe("minor_edit");
    expect(correction.feedback).toBe("Ton war zu formell");

    const found = correctionRepo.findByDraftId(draft.id);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((c) => c.id === correction.id)).toBe(true);
  });

  it("records a rejection correction", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "rejected"));

    correctionRepo.insert({
      id: randomUUID(),
      draftId: draft.id,
      taskId: draft.taskId,
      originalBody: "Original body",
      editedBody: "",
      editedSubject: null,
      changeType: "rejection",
      feedback: "Komplett falsche Information",
    });

    const corrections = correctionRepo.findByDraftId(draft.id);
    expect(corrections.some((c) => c.changeType === "rejection")).toBe(true);
  });

  it("finds recent corrections", () => {
    const recent = correctionRepo.findRecent(10);
    expect(Array.isArray(recent)).toBe(true);
  });
});

describe("Draft Lifecycle", () => {
  it("goes through pending → approved → sent", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "pending_review"));
    expect(draft.status).toBe("pending_review");

    draftRepo.updateStatus(draft.id, "approved", "reviewer");
    const approved = draftRepo.findById(draft.id)!;
    expect(approved.status).toBe("approved");
    expect(approved.reviewedAt).toBeTruthy();

    draftRepo.updateStatus(draft.id, "sent");
    const sent = draftRepo.findById(draft.id)!;
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeTruthy();
  });

  it("goes through pending → edited_and_sent with correction", () => {
    const draft = draftRepo.insert(makeDraft(randomUUID(), "pending_review"));

    draftRepo.updateBody(draft.id, "Bearbeiteter Text");
    draftRepo.updateStatus(draft.id, "edited_and_sent", "editor");

    correctionRepo.insert({
      id: randomUUID(),
      draftId: draft.id,
      taskId: draft.taskId,
      originalBody: draft.originalBody,
      editedBody: "Bearbeiteter Text",
      editedSubject: null,
      changeType: "tone_change",
      feedback: "Formeller Ton für Geschäftskunden",
    });

    const final = draftRepo.findById(draft.id)!;
    expect(final.status).toBe("edited_and_sent");
    expect(final.body).toBe("Bearbeiteter Text");
    expect(final.originalBody).toBe("Original draft body");

    const corrections = correctionRepo.findByDraftId(draft.id);
    expect(corrections.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------- Helper ----------

function makeDraft(id: string, status: DraftStatus): Omit<Draft, "createdAt" | "updatedAt"> {
  return {
    id,
    taskId: `task-${id.slice(0, 8)}`,
    sourceMessageId: null,
    channel: "email",
    to: ["test@example.com"],
    cc: [],
    subject: "Test Draft",
    body: "Original draft body",
    originalBody: "Original draft body",
    status,
    priority: "normal",
    conductorNotes: null,
    qualityScore: null,
    qualityNotes: null,
    autoApproveMatch: null,
    reviewedBy: null,
    reviewedAt: null,
    sentAt: null,
    externalDraftId: null,
    metadata: {},
  };
}
