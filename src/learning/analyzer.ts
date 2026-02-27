import { correctionRepo, draftRepo, promptRepo } from "../db.js";
import type { Correction } from "../approval/types.js";
import type { PromptMetrics } from "../types.js";

/**
 * Correction pattern analysis — finds recurring issues in MA corrections
 * and generates actionable insights for prompt improvement.
 */

export interface CorrectionPattern {
  type: Correction["changeType"];
  count: number;
  percentage: number;
  examples: Array<{ draftId: string; feedback: string | null }>;
}

export interface LearningInsight {
  id: string;
  agentType: string;
  totalDrafts: number;
  totalCorrections: number;
  correctionRate: number;
  patterns: CorrectionPattern[];
  suggestions: string[];
  generatedAt: string;
}

export interface PromptSuggestion {
  promptName: string;
  currentVersion: number | null;
  issue: string;
  suggestion: string;
  basedOnCorrections: number;
  confidence: "low" | "medium" | "high";
}

export function analyzeCorrections(): LearningInsight[] {
  const corrections = correctionRepo.findRecent(200);
  if (corrections.length === 0) return [];

  // Group corrections by agent type (from draft metadata)
  const byAgent = new Map<string, Correction[]>();
  for (const c of corrections) {
    const draft = draftRepo.findById(c.draftId);
    const agentType = (draft?.metadata?.["agentType"] as string) ?? "unknown";
    const list = byAgent.get(agentType) ?? [];
    list.push(c);
    byAgent.set(agentType, list);
  }

  const insights: LearningInsight[] = [];

  for (const [agentType, agentCorrections] of byAgent) {
    const allDrafts = draftRepo.findRecent(500);
    const agentDrafts = allDrafts.filter(
      (d) => (d.metadata?.["agentType"] as string) === agentType,
    );

    const patterns = buildPatterns(agentCorrections);
    const suggestions = buildSuggestionTexts(agentType, patterns);

    insights.push({
      id: `insight-${agentType}-${Date.now()}`,
      agentType,
      totalDrafts: agentDrafts.length,
      totalCorrections: agentCorrections.length,
      correctionRate: agentDrafts.length > 0
        ? Math.round((agentCorrections.length / agentDrafts.length) * 100)
        : 0,
      patterns,
      suggestions,
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

export function generatePromptSuggestions(): PromptSuggestion[] {
  const insights = analyzeCorrections();
  const suggestions: PromptSuggestion[] = [];

  for (const insight of insights) {
    if (insight.correctionRate < 10) continue;

    const promptName = `${insight.agentType}-system-prompt`;
    const active = promptRepo.findActive(promptName);

    // Tone corrections → suggest tone guidance
    const tonePattern = insight.patterns.find((p) => p.type === "tone_change");
    if (tonePattern && tonePattern.count >= 2) {
      const feedbackExamples = tonePattern.examples
        .filter((e) => e.feedback)
        .map((e) => e.feedback)
        .slice(0, 3);

      suggestions.push({
        promptName,
        currentVersion: active?.version ?? null,
        issue: `${tonePattern.count} Ton-Korrekturen (${tonePattern.percentage}%)`,
        suggestion: buildToneSuggestion(feedbackExamples as string[]),
        basedOnCorrections: tonePattern.count,
        confidence: tonePattern.count >= 5 ? "high" : "medium",
      });
    }

    // Major rewrites → suggest structural changes
    const rewritePattern = insight.patterns.find((p) => p.type === "major_rewrite");
    if (rewritePattern && rewritePattern.count >= 2) {
      suggestions.push({
        promptName,
        currentVersion: active?.version ?? null,
        issue: `${rewritePattern.count} komplette Umschreibungen (${rewritePattern.percentage}%)`,
        suggestion: "Der Agent-Output weicht stark von dem ab, was der MA erwartet. "
          + "Überprüfe den System-Prompt auf: Zielgruppe, Detailgrad, Format-Vorgaben, und spezifische Anweisungen zum Aufbau der Antwort.",
        basedOnCorrections: rewritePattern.count,
        confidence: rewritePattern.count >= 5 ? "high" : "medium",
      });
    }

    // High rejection rate → fundamental prompt issue
    const rejectionPattern = insight.patterns.find((p) => p.type === "rejection");
    if (rejectionPattern && rejectionPattern.percentage >= 20) {
      const reasons = rejectionPattern.examples
        .filter((e) => e.feedback)
        .map((e) => e.feedback)
        .slice(0, 5);

      suggestions.push({
        promptName,
        currentVersion: active?.version ?? null,
        issue: `${rejectionPattern.percentage}% Ablehnungsrate`,
        suggestion: `Hohe Ablehnungsrate deutet auf fundamentales Problem hin. `
          + `Häufige Gründe: ${reasons.join("; ") || "keine Begründungen angegeben"}. `
          + `Empfehlung: System-Prompt grundlegend überarbeiten.`,
        basedOnCorrections: rejectionPattern.count,
        confidence: "high",
      });
    }

    // High overall correction rate
    if (insight.correctionRate >= 50 && suggestions.length === 0) {
      suggestions.push({
        promptName,
        currentVersion: active?.version ?? null,
        issue: `${insight.correctionRate}% Korrekturrate`,
        suggestion: "Mehr als die Hälfte aller Drafts wird korrigiert. "
          + "Der System-Prompt braucht klarere Anweisungen zu Ton, Format und Inhalt.",
        basedOnCorrections: insight.totalCorrections,
        confidence: "medium",
      });
    }
  }

  return suggestions;
}

/**
 * Updates prompt metrics based on correction data.
 */
export function updatePromptMetrics(agentType: string): void {
  const promptName = `${agentType}-system-prompt`;
  const active = promptRepo.findActive(promptName);
  if (!active) return;

  const allDrafts = draftRepo.findRecent(200);
  const agentDrafts = allDrafts.filter(
    (d) => (d.metadata?.["agentType"] as string) === agentType,
  );

  const correctedDrafts = agentDrafts.filter(
    (d) => d.status === "edited_and_sent" || d.status === "rejected",
  );

  const metrics: PromptMetrics = {
    usageCount: agentDrafts.length,
    positiveRating: agentDrafts.filter((d) => d.status === "approved" || d.status === "sent").length,
    negativeRating: agentDrafts.filter((d) => d.status === "rejected").length,
    avgDuration_ms: 0,
    correctionRate: agentDrafts.length > 0
      ? Math.round((correctedDrafts.length / agentDrafts.length) * 100)
      : 0,
  };

  promptRepo.updateMetrics(active.id, metrics);
}

// ---------- Helpers ----------

function buildSuggestionTexts(agentType: string, patterns: CorrectionPattern[]): string[] {
  const suggestions: string[] = [];
  for (const p of patterns) {
    if (p.count >= 2) {
      suggestions.push(`${p.type}: ${p.count}x (${p.percentage}%) bei ${agentType}`);
    }
  }
  return suggestions;
}

function buildPatterns(corrections: Correction[]): CorrectionPattern[] {
  const types: Correction["changeType"][] = ["minor_edit", "major_rewrite", "tone_change", "factual_fix", "rejection"];
  const total = corrections.length;

  return types
    .map((type) => {
      const matching = corrections.filter((c) => c.changeType === type);
      return {
        type,
        count: matching.length,
        percentage: total > 0 ? Math.round((matching.length / total) * 100) : 0,
        examples: matching.slice(0, 5).map((c) => ({
          draftId: c.draftId,
          feedback: c.feedback,
        })),
      };
    })
    .filter((p) => p.count > 0);
}

function buildToneSuggestion(feedbackExamples: string[]): string {
  if (feedbackExamples.length === 0) {
    return "Mehrere Ton-Korrekturen erkannt. Ergänze im System-Prompt: gewünschten Ton (formell/informell), Anrede-Form, und Beispiele.";
  }

  return `Ton-Korrekturen erkannt. MA-Feedback: "${feedbackExamples.join('", "')}". `
    + "Ergänze diese Hinweise direkt im System-Prompt als Ton-Anweisung.";
}
