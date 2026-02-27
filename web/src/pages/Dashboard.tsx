import { useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  Eye,
} from "lucide-react";
import { api, type StatusResponse } from "../lib/api";
import { usePolling } from "../hooks/usePolling";
import { StatusCard } from "../components/StatusCard";

export function Dashboard() {
  const fetcher = useCallback(() => api.getStatus(), []);
  const { data: status, loading } = usePolling<StatusResponse>(fetcher, 3000);

  if (loading || !status) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-slate-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Übersicht aller Aufgaben und Nachrichten
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatusCard
          title="In Bearbeitung"
          value={status.tasks.running}
          icon={<Clock size={20} className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatusCard
          title="Wartend"
          value={status.tasks.pending}
          icon={<Clock size={20} className="text-amber-600" />}
          color="bg-amber-50"
        />
        <StatusCard
          title="Abgeschlossen"
          value={status.tasks.completed}
          icon={<CheckCircle2 size={20} className="text-green-600" />}
          color="bg-green-50"
        />
        <StatusCard
          title="Fehlgeschlagen"
          value={status.tasks.failed}
          icon={<XCircle size={20} className="text-red-600" />}
          color="bg-red-50"
        />
        <StatusCard
          title="Neue Nachrichten"
          value={status.messages.new}
          icon={<Mail size={20} className="text-indigo-600" />}
          color="bg-indigo-50"
        />
        <StatusCard
          title="Freigabe nötig"
          value={status.needsReview}
          icon={<Eye size={20} className="text-orange-600" />}
          color="bg-orange-50"
          subtitle="Entwürfe zur Prüfung"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Letzte Ereignisse</h2>
        </div>
        <div className="p-5 text-sm text-slate-500">
          <p>Echtzeit-Ereignisse werden hier angezeigt, sobald Aufgaben verarbeitet werden.</p>
        </div>
      </div>
    </div>
  );
}
