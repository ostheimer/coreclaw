import { useCallback } from "react";
import {
  Brain,
  TrendingUp,
  Lightbulb,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { usePolling } from "../hooks/usePolling";

interface CorrectionPattern {
  type: string;
  count: number;
  percentage: number;
  examples: Array<{ draftId: string; feedback: string | null }>;
}

interface LearningInsight {
  id: string;
  agentType: string;
  totalDrafts: number;
  totalCorrections: number;
  correctionRate: number;
  patterns: CorrectionPattern[];
  suggestions: string[];
  generatedAt: string;
}

interface PromptSuggestion {
  promptName: string;
  currentVersion: number | null;
  issue: string;
  suggestion: string;
  basedOnCorrections: number;
  confidence: "low" | "medium" | "high";
}

export function Learning() {
  const insightsFetcher = useCallback(
    () => fetch("/api/learning/insights").then((r) => r.json()) as Promise<LearningInsight[]>,
    [],
  );
  const suggestionsFetcher = useCallback(
    () => fetch("/api/learning/suggestions").then((r) => r.json()) as Promise<PromptSuggestion[]>,
    [],
  );

  const { data: insights, refresh: refreshInsights } = usePolling<LearningInsight[]>(insightsFetcher, 30000);
  const { data: suggestions } = usePolling<PromptSuggestion[]>(suggestionsFetcher, 30000);

  const refresh = () => refreshInsights();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain size={24} />
            Lernen
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Korrektur-Analyse, Muster-Erkennung und Prompt-Verbesserungen
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <RefreshCw size={14} /> Aktualisieren
        </button>
      </div>

      {/* Prompt Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
            <Lightbulb size={16} />
            Prompt-Verbesserungen ({suggestions.length})
          </h2>
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Agent Insights */}
      {insights && insights.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BarChart3 size={16} />
            Korrektur-Analyse pro Agent
          </h2>
          <div className="space-y-4">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <Brain size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Noch keine Lern-Daten vorhanden</p>
          <p className="text-xs text-slate-400 mt-2">
            Sobald der MA Entwürfe bearbeitet oder ablehnt, erkennt CoreClaw Muster
            und schlägt Prompt-Verbesserungen vor.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <TrendingUp size={16} />
          So lernt CoreClaw
        </h3>
        <ol className="text-sm text-slate-500 space-y-1.5 list-decimal list-inside">
          <li>Agent erstellt einen Entwurf → MA prüft in der Drafts-Seite</li>
          <li>MA gibt frei, bearbeitet oder lehnt ab → Korrektur wird gespeichert</li>
          <li>Learning Conductor erkennt Muster (Ton, Umschreibungen, Ablehnungen)</li>
          <li>System generiert Prompt-Verbesserungsvorschläge</li>
          <li>Admin übernimmt Vorschläge → Agent wird mit jeder Korrektur besser</li>
        </ol>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: PromptSuggestion }) {
  const confidenceColors: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb size={16} className="text-amber-500" />
          <span className="font-medium text-slate-900 text-sm">{suggestion.promptName}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceColors[suggestion.confidence] ?? ""}`}>
            {suggestion.confidence === "high" ? "Hohe" : suggestion.confidence === "medium" ? "Mittlere" : "Niedrige"} Konfidenz
          </span>
          <span className="text-xs text-slate-400">
            Basiert auf {suggestion.basedOnCorrections} Korrektur(en)
          </span>
        </div>
        <p className="text-sm text-red-600 mb-2 flex items-center gap-1">
          <AlertTriangle size={12} /> {suggestion.issue}
        </p>
        <p className="text-sm text-slate-700 bg-amber-50 rounded-lg p-3">
          {suggestion.suggestion}
        </p>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: LearningInsight }) {
  const rateColor = insight.correctionRate >= 50
    ? "text-red-600"
    : insight.correctionRate >= 25
      ? "text-amber-600"
      : "text-green-600";

  const changeTypeLabels: Record<string, { label: string; icon: typeof Pencil }> = {
    minor_edit: { label: "Kleine Änderungen", icon: Pencil },
    major_rewrite: { label: "Komplette Umschreibungen", icon: AlertTriangle },
    tone_change: { label: "Ton-Korrekturen", icon: TrendingUp },
    factual_fix: { label: "Fakten-Korrekturen", icon: AlertTriangle },
    rejection: { label: "Ablehnungen", icon: AlertTriangle },
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 text-sm">{insight.agentType}</span>
          <span className="text-xs text-slate-400">
            {insight.totalDrafts} Entwürfe, {insight.totalCorrections} Korrekturen
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-lg font-bold ${rateColor}`}>{insight.correctionRate}%</span>
          <span className="text-xs text-slate-400">Korrekturrate</span>
        </div>
      </div>

      {insight.patterns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {insight.patterns.map((p) => {
            const meta = changeTypeLabels[p.type] ?? { label: p.type, icon: Pencil };
            const Icon = meta.icon;
            return (
              <div
                key={p.type}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-xs text-slate-600"
              >
                <Icon size={12} />
                <span>{meta.label}</span>
                <span className="font-medium text-slate-800">{p.count}x</span>
                <span className="text-slate-400">({p.percentage}%)</span>
              </div>
            );
          })}
        </div>
      )}

      {insight.patterns.some((p) => p.examples.some((e) => e.feedback)) && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-1">MA-Feedback:</p>
          <div className="flex flex-wrap gap-1.5">
            {insight.patterns
              .flatMap((p) => p.examples.filter((e) => e.feedback).map((e) => e.feedback))
              .slice(0, 5)
              .map((fb, i) => (
                <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                  "{fb}"
                </span>
              ))}
          </div>
        </div>
      )}

      {insight.correctionRate === 0 && (
        <p className="text-sm text-green-600 flex items-center gap-1">
          <CheckCircle2 size={14} /> Keine Korrekturen — Agent liefert gute Ergebnisse
        </p>
      )}
    </div>
  );
}
