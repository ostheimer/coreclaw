import { useCallback, useState } from "react";
import { Mail, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { api, type Message } from "../lib/api";
import { usePolling } from "../hooks/usePolling";

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

export function Inbox() {
  const [filter, setFilter] = useState<"new" | "processing" | "handled">("new");
  const fetcher = useCallback(() => api.getMessages(filter), [filter]);
  const { data: messages, loading, refresh } = usePolling<Message[]>(fetcher, 5000);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-500 mt-1">Eingehende Nachrichten und E-Mails</p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Aktualisieren
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(["new", "processing", "handled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === s
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {{ new: "Neu", processing: "In Bearbeitung", handled: "Erledigt" }[s]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {loading && !messages ? (
          <div className="p-8 text-center">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg" />
              ))}
            </div>
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg) => <MessageRow key={msg.id} message={msg} />)
        ) : (
          <div className="p-12 text-center">
            <Mail size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">Keine Nachrichten mit Status "{filter}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const isUrgent = message.metadata?.type === "urgent" || message.subject?.toLowerCase().includes("urgent");

  return (
    <div className="hover:bg-slate-50 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left"
      >
        <div className="flex-shrink-0">
          {isUrgent ? (
            <AlertTriangle size={18} className="text-red-500" />
          ) : (
            <Mail size={18} className="text-slate-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm truncate">{message.from}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_BADGE["normal"]}`}>
              {message.channel}
            </span>
          </div>
          <p className="text-sm text-slate-700 truncate mt-0.5">
            {message.subject ?? "(Kein Betreff)"}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-slate-400">
            <Clock size={12} className="inline mr-1" />
            {new Date(message.createdAt).toLocaleString("de-DE")}
          </span>
          <ChevronRight
            size={16}
            className={`text-slate-300 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 ml-10">
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {message.body}
          </div>
          {message.threadId && (
            <p className="mt-2 text-xs text-slate-400">Thread: {message.threadId}</p>
          )}
        </div>
      )}
    </div>
  );
}
