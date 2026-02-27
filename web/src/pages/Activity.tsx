import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Mail,
  Zap,
} from "lucide-react";
import type { WsEvent } from "../hooks/useWebSocket";

const EVENT_ICONS: Record<string, typeof CheckCircle2> = {
  "task:completed": CheckCircle2,
  "task:failed": XCircle,
  "task:created": Clock,
  "task:escalated": AlertTriangle,
  "message:received": Mail,
  "message:processed": Mail,
};

const EVENT_COLORS: Record<string, string> = {
  "task:completed": "text-green-500",
  "task:failed": "text-red-500",
  "task:created": "text-blue-500",
  "task:escalated": "text-orange-500",
  "message:received": "text-indigo-500",
  "message:processed": "text-slate-400",
};

const EVENT_LABELS: Record<string, string> = {
  "task:completed": "Aufgabe abgeschlossen",
  "task:failed": "Aufgabe fehlgeschlagen",
  "task:created": "Neue Aufgabe",
  "task:escalated": "Eskalation",
  "message:received": "Nachricht empfangen",
  "message:processed": "Nachricht verarbeitet",
  "conductor:briefing": "Briefing",
  "conductor:review-request": "Review angefragt",
  "conductor:review-result": "Review-Ergebnis",
};

export function Activity({ events }: { events: WsEvent[] }) {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Aktivität</h1>
        <p className="text-sm text-slate-500 mt-1">
          Echtzeit-Ereignisse aus dem System
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {events.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {events.map((event, i) => {
              const Icon = EVENT_ICONS[event.type] ?? Zap;
              const color = EVENT_COLORS[event.type] ?? "text-slate-400";
              const label = EVENT_LABELS[event.type] ?? event.type;

              return (
                <div key={`${event.timestamp}-${i}`} className="px-5 py-3 flex items-center gap-4">
                  <Icon size={16} className={color} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      von {event.source}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString("de-DE")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Zap size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">Noch keine Ereignisse.</p>
            <p className="text-xs text-slate-400 mt-1">
              Ereignisse erscheinen hier in Echtzeit per WebSocket.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
