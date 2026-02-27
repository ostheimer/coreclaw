import { useCallback, useState } from "react";
import {
  FileEdit,
  Check,
  X,
  Pencil,
  Eye,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  Star,
  Clock,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { usePolling } from "../hooks/usePolling";

interface Draft {
  id: string;
  taskId: string;
  sourceMessageId: string | null;
  channel: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  originalBody: string;
  status: string;
  priority: string;
  conductorNotes: string | null;
  qualityScore: number | null;
  qualityNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  sentAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface DraftStats {
  pendingReview: number;
  approvedToday: number;
  rejectedToday: number;
  autoApprovedToday: number;
  correctionsToday: number;
}

interface DraftDetail {
  draft: Draft;
  corrections: Array<{
    id: string;
    originalBody: string;
    editedBody: string;
    changeType: string;
    feedback: string | null;
    createdAt: string;
  }>;
  sourceMessage: {
    id: string;
    from: string;
    subject: string | null;
    body: string;
    createdAt: string;
  } | null;
}

export function Drafts() {
  const draftsFetcher = useCallback(
    () => fetch("/api/drafts").then((r) => r.json()) as Promise<Draft[]>,
    [],
  );
  const statsFetcher = useCallback(
    () => fetch("/api/drafts/stats").then((r) => r.json()) as Promise<DraftStats>,
    [],
  );
  const recentFetcher = useCallback(
    () => fetch("/api/drafts/recent?limit=20").then((r) => r.json()) as Promise<Draft[]>,
    [],
  );

  const { data: pending, loading, refresh } = usePolling<Draft[]>(draftsFetcher, 4000);
  const { data: stats } = usePolling<DraftStats>(statsFetcher, 8000);
  const { data: recent } = usePolling<Draft[]>(recentFetcher, 8000);

  const handled = recent?.filter((d) => d.status !== "pending_review") ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Entwürfe</h1>
          <p className="text-sm text-slate-500 mt-1">
            Agent-Entwürfe prüfen, bearbeiten und freigeben
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatBadge icon={Eye} label="Zur Prüfung" value={stats.pendingReview} color="orange" />
          <StatBadge icon={Check} label="Freigegeben" value={stats.approvedToday} color="green" />
          <StatBadge icon={X} label="Abgelehnt" value={stats.rejectedToday} color="red" />
          <StatBadge icon={Send} label="Auto-genehmigt" value={stats.autoApprovedToday} color="blue" />
          <StatBadge icon={Pencil} label="Korrekturen" value={stats.correctionsToday} color="purple" />
        </div>
      )}

      {/* Pending Review Queue */}
      {pending && pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
            <Eye size={16} />
            Freigabe nötig ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((draft) => (
              <DraftCard key={draft.id} draft={draft} onAction={refresh} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {handled.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <Clock size={16} />
            Letzte Aktivität
          </h2>
          <div className="space-y-2">
            {handled.map((draft) => (
              <HandledDraftRow key={draft.id} draft={draft} />
            ))}
          </div>
        </div>
      )}

      {loading && !pending && (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-xl" />
          ))}
        </div>
      )}

      {pending && pending.length === 0 && !handled.length && (
        <div className="text-center py-16">
          <FileEdit size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Keine Entwürfe zur Prüfung</p>
          <p className="text-xs text-slate-400 mt-1">
            Wenn ein Agent eine E-Mail-Antwort erstellt, erscheint sie hier zur Freigabe.
          </p>
        </div>
      )}
    </div>
  );
}

function StatBadge({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${colorMap[color] ?? ""}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-75 mb-0.5">
        <Icon size={12} />
        {label}
      </div>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

function DraftCard({ draft, onAction }: { draft: Draft; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.body);
  const [editedSubject, setEditedSubject] = useState(draft.subject);
  const [feedback, setFeedback] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<DraftDetail | null>(null);

  const loadDetail = async () => {
    if (detail) return;
    try {
      const res = await fetch(`/api/drafts/${draft.id}`);
      setDetail(await res.json() as DraftDetail);
    } catch { /* ignore */ }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadDetail();
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await fetch(`/api/drafts/${draft.id}/approve`, { method: "POST" });
      onAction();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/drafts/${draft.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      onAction();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditAndApprove = async () => {
    setSubmitting(true);
    try {
      await fetch(`/api/drafts/${draft.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: editedBody,
          subject: editedSubject,
          feedback: feedback || null,
        }),
      });
      onAction();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm truncate max-w-xs">
              {draft.subject || "(kein Betreff)"}
            </span>
            <PriorityBadge priority={draft.priority} />
            {draft.qualityScore !== null && <QualityBadge score={draft.qualityScore} />}
            <span className="text-xs text-slate-400">{draft.channel}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            An: {draft.to.join(", ") || "—"}
            <span className="text-slate-400 ml-2">
              {new Date(draft.createdAt).toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
          {draft.qualityNotes && (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <BarChart3 size={10} /> {draft.qualityNotes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => void handleApprove()}
            disabled={submitting}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Freigeben
          </button>
          <button
            onClick={() => { setEditing(!editing); setExpanded(true); void loadDetail(); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Pencil size={14} />
            Bearbeiten
          </button>
          <button
            onClick={() => { setShowReject(!showReject); setExpanded(true); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <X size={14} />
          </button>
          <button onClick={handleExpand} className="p-1.5 text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
          {/* Source Message Context */}
          {detail?.sourceMessage && (
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <MessageSquare size={10} /> Ursprüngliche Nachricht von {detail.sourceMessage.from}
              </p>
              <p className="text-xs font-medium text-slate-600 mb-1">{detail.sourceMessage.subject}</p>
              <div className="text-sm text-slate-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {stripHtml(detail.sourceMessage.body).slice(0, 500)}
              </div>
            </div>
          )}

          {/* Draft Content (View or Edit) */}
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Betreff</label>
                <input
                  type="text"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Antwort</label>
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Feedback für das System (optional — hilft beim Lernen)
                </label>
                <input
                  type="text"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="z.B. 'Ton war zu formell', 'Falsche Produktinfo'"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleEditAndApprove()}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Bearbeitet freigeben
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs text-blue-500 mb-1">Agent-Entwurf</p>
              <div className="text-sm text-slate-800 whitespace-pre-wrap">{draft.body}</div>
            </div>
          )}

          {/* Reject Section */}
          {showReject && (
            <div className="bg-red-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-red-700">Entwurf ablehnen</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Warum wird der Entwurf abgelehnt? (Pflichtfeld — hilft beim Lernen)"
                rows={3}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void handleReject()}
                  disabled={submitting || !rejectReason.trim()}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <X size={14} /> Ablehnen
                </button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2 text-sm text-slate-600">
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HandledDraftRow({ draft }: { draft: Draft }) {
  const statusLabel: Record<string, { text: string; color: string }> = {
    approved: { text: "Freigegeben", color: "text-green-600 bg-green-50" },
    sent: { text: "Gesendet", color: "text-green-700 bg-green-100" },
    edited_and_sent: { text: "Bearbeitet & gesendet", color: "text-blue-600 bg-blue-50" },
    rejected: { text: "Abgelehnt", color: "text-red-600 bg-red-50" },
    auto_approved: { text: "Auto-genehmigt", color: "text-purple-600 bg-purple-50" },
  };

  const s = statusLabel[draft.status] ?? { text: draft.status, color: "text-slate-500 bg-slate-50" };

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.text}</span>
        <span className="text-sm text-slate-700 truncate">{draft.subject || "(kein Betreff)"}</span>
        <span className="text-xs text-slate-400">→ {draft.to.join(", ")}</span>
      </div>
      <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
        {new Date(draft.updatedAt).toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
      </span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    normal: "bg-slate-100 text-slate-600",
    low: "bg-slate-50 text-slate-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority] ?? colors["normal"]}`}>
      {priority}
    </span>
  );
}

function QualityBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <span className={`text-xs flex items-center gap-0.5 ${color}`}>
      <Star size={10} /> {score}
    </span>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
}
