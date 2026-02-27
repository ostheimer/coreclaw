import { useCallback, useState } from "react";
import { FileEdit, Check, X, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { api, type Task } from "../lib/api";
import { usePolling } from "../hooks/usePolling";

export function Drafts() {
  const fetcher = useCallback(() => api.getTasks("completed"), []);
  const { data: tasks, loading, refresh } = usePolling<Task[]>(fetcher, 5000);

  const needsReview = tasks?.filter((t) => t.result?.needsReview) ?? [];
  const approved = tasks?.filter((t) => !t.result?.needsReview) ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Entwürfe</h1>
          <p className="text-sm text-slate-500 mt-1">
            Agent-Entwürfe prüfen und freigeben
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Eye size={16} />
          <span>{needsReview.length} zur Prüfung</span>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
            <Eye size={16} />
            Freigabe nötig ({needsReview.length})
          </h2>
          <div className="space-y-3">
            {needsReview.map((task) => (
              <DraftCard key={task.id} task={task} onAction={refresh} />
            ))}
          </div>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
            <Check size={16} />
            Freigegeben ({approved.length})
          </h2>
          <div className="space-y-3">
            {approved.map((task) => (
              <DraftCard key={task.id} task={task} onAction={refresh} readonly />
            ))}
          </div>
        </div>
      )}

      {loading && !tasks && (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-xl" />
          ))}
        </div>
      )}

      {tasks && tasks.length === 0 && (
        <div className="text-center py-16">
          <FileEdit size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Noch keine Entwürfe vorhanden</p>
        </div>
      )}
    </div>
  );
}

function DraftCard({
  task,
  onAction,
  readonly = false,
}: {
  task: Task;
  onAction: () => void;
  readonly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.approveTask(task.id);
      onAction();
    } finally {
      setApproving(false);
    }
  };

  const output = task.result;
  const content = output?.outputs?.[0]?.content ?? "";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm">{task.type}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                task.priority === "urgent"
                  ? "bg-red-100 text-red-700"
                  : task.priority === "high"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {task.priority}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-0.5 truncate">
            {output?.summary ?? "Kein Zusammenfassung"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!readonly && output?.needsReview && (
            <>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Check size={14} />
                Freigeben
              </button>
              <button className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <X size={14} />
                Ablehnen
              </button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && content && (
        <div className="px-5 pb-4 border-t border-slate-100 pt-4">
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {content}
          </div>
          {output?.error && (
            <div className="mt-3 bg-red-50 rounded-lg p-3 text-sm text-red-700">
              Fehler: {output.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
