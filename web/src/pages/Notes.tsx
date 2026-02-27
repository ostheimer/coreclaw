import { useState } from "react";
import { Phone, Send, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

export function Notes() {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setSending(true);
    setSuccess(false);

    try {
      await api.createNote({
        from: from || "Mitarbeiter",
        subject: subject || undefined,
        body,
        caseRef: caseRef || undefined,
      });
      setSuccess(true);
      setBody("");
      setSubject("");
      setCaseRef("");
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Notiz erfassen</h1>
        <p className="text-sm text-slate-500 mt-1">
          Anruf-Notizen, Gesprächsprotokolle oder manuelle Eingaben
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Erfasst von
              </label>
              <input
                type="text"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Name des Mitarbeiters"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Case-Referenz
              </label>
              <input
                type="text"
                value={caseRef}
                onChange={(e) => setCaseRef(e.target.value)}
                placeholder="z.B. CASE-4711"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Betreff
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Kurze Beschreibung"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notiz <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Gesprächsnotiz, Anrufprotokoll, oder sonstige Informationen..."
              rows={6}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Phone size={14} />
              <span>Wird als manueller Eingang verarbeitet</span>
            </div>

            <button
              type="submit"
              disabled={sending || !body.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {success ? (
                <>
                  <CheckCircle2 size={16} />
                  Gespeichert
                </>
              ) : (
                <>
                  <Send size={16} />
                  {sending ? "Wird gespeichert..." : "Erfassen"}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
