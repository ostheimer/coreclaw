import { useState, useEffect, useCallback } from "react";
import {
  Bot, Save, RefreshCw, ChevronDown, Plus, X, Eye, EyeOff,
  Sparkles, Shield, Zap, Brain, Gauge,
} from "lucide-react";
import { usePolling } from "../hooks/usePolling";

type Tone = "formell" | "professionell" | "freundlich" | "locker";
type Language = "de" | "en" | "fr" | "es" | "it";
type OperationMode = "sandbox" | "suggest" | "assist" | "autonomous";

interface Personality {
  name: string;
  role: string;
  tone: Tone;
  language: Language;
  traits: string[];
  rules: string[];
  mode: OperationMode;
  updatedAt: string;
}

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "formell", label: "Formell", description: "Sachlich, gesiezt, kein Smalltalk" },
  { value: "professionell", label: "Professionell", description: "Klar und freundlich, aber geschäftsmäßig" },
  { value: "freundlich", label: "Freundlich-Professionell", description: "Nahbar, persönlich, aber seriös" },
  { value: "locker", label: "Locker", description: "Direkt, geduzt wo passend" },
];

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "Englisch" },
  { value: "fr", label: "Französisch" },
  { value: "es", label: "Spanisch" },
  { value: "it", label: "Italienisch" },
];

const MODE_OPTIONS: {
  value: OperationMode;
  label: string;
  description: string;
  color: string;
  Icon: typeof Shield;
}[] = [
  {
    value: "sandbox",
    label: "Sandbox",
    description: "Nur lesen. Protokolliert was er tun würde — handelt nicht.",
    color: "blue",
    Icon: Shield,
  },
  {
    value: "suggest",
    label: "Vorschlag",
    description: "Erstellt Entwürfe zur Prüfung. Schreibt noch nichts selbst.",
    color: "amber",
    Icon: Eye,
  },
  {
    value: "assist",
    label: "Assistenz",
    description: "Routine erledigt er selbst. Komplexes kommt zur Prüfung.",
    color: "green",
    Icon: Zap,
  },
  {
    value: "autonomous",
    label: "Autonomie",
    description: "Handelt selbstständig. Eskaliert nur Ausnahmen.",
    color: "purple",
    Icon: Brain,
  },
];

const SUGGESTED_TRAITS = [
  "präzise", "freundlich", "empathisch", "lösungsorientiert",
  "zuverlässig", "geduldig", "proaktiv", "diplomatisch", "effizient",
];

export function Personality() {
  const fetcher = useCallback(
    () => fetch("/api/personality").then((r) => r.json()) as Promise<Personality>,
    [],
  );
  const { data: saved, refresh } = usePolling<Personality>(fetcher, 0);

  const [form, setForm] = useState<Personality | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved_ok, setSavedOk] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<string>("");
  const [newTrait, setNewTrait] = useState("");
  const [newRule, setNewRule] = useState("");

  useEffect(() => {
    if (saved && !form) setForm(saved);
  }, [saved, form]);

  const loadPreview = async () => {
    if (!form) return;
    const res = await fetch("/api/personality/prompt");
    const data = await res.json() as { prompt: string };
    setPreviewPrompt(data.prompt);
    setShowPrompt(true);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSavedOk(false);
    try {
      await fetch("/api/personality", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSavedOk(true);
      refresh();
      setTimeout(() => setSavedOk(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const addTrait = (trait: string) => {
    const t = trait.trim();
    if (!t || !form || form.traits.includes(t)) return;
    setForm({ ...form, traits: [...form.traits, t] });
    setNewTrait("");
  };

  const removeTrait = (trait: string) => {
    if (!form) return;
    setForm({ ...form, traits: form.traits.filter((t) => t !== trait) });
  };

  const addRule = () => {
    const r = newRule.trim();
    if (!r || !form) return;
    setForm({ ...form, rules: [...form.rules, r] });
    setNewRule("");
  };

  const removeRule = (index: number) => {
    if (!form) return;
    setForm({ ...form, rules: form.rules.filter((_, i) => i !== index) });
  };

  const modeColor = (mode: OperationMode, selected: boolean) => {
    if (!selected) return "border-slate-200 bg-white hover:border-slate-300";
    const map: Record<OperationMode, string> = {
      sandbox: "border-blue-500 bg-blue-50",
      suggest: "border-amber-500 bg-amber-50",
      assist: "border-green-500 bg-green-50",
      autonomous: "border-purple-500 bg-purple-50",
    };
    return map[mode];
  };

  const modeTextColor = (mode: OperationMode) => {
    const map: Record<OperationMode, string> = {
      sandbox: "text-blue-700",
      suggest: "text-amber-700",
      assist: "text-green-700",
      autonomous: "text-purple-700",
    };
    return map[mode];
  };

  if (!form) {
    return (
      <div className="p-8 flex items-center justify-center h-48">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bot size={24} />
            Persönlichkeit
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Wie soll sich {form.name} verhalten? Diese Einstellungen bestimmen Ton, Sprache und Charakter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadPreview()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {showPrompt ? <EyeOff size={14} /> : <Eye size={14} />}
            Prompt-Vorschau
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saved_ok ? "Gespeichert!" : "Speichern"}
          </button>
        </div>
      </div>

      {/* Prompt Preview */}
      {showPrompt && (
        <div className="mb-6 bg-slate-900 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Generierter System-Prompt</span>
            <button onClick={() => setShowPrompt(false)} className="text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          </div>
          <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono leading-relaxed">{previewPrompt}</pre>
        </div>
      )}

      <div className="space-y-6">
        {/* Identity */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sparkles size={14} /> Identität
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name des Assistenten</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. CoreClaw, Alex, Mia, …"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rolle (ein Satz)</label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="z.B. Freundlicher Support-Assistent für E-Mail-Anfragen"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Communication */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <ChevronDown size={14} /> Kommunikation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tonalität</label>
              <div className="space-y-2">
                {TONE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setForm({ ...form, tone: t.value })}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      form.tone === t.value
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Standardsprache</label>
              <div className="space-y-2">
                {LANGUAGE_OPTIONS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setForm({ ...form, language: l.value })}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      form.language === l.value
                        ? "border-blue-500 bg-blue-50 text-blue-800 font-medium"
                        : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Traits */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sparkles size={14} /> Charaktereigenschaften
          </h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {form.traits.map((trait) => (
              <span key={trait} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {trait}
                <button onClick={() => removeTrait(trait)} className="hover:text-blue-600 ml-0.5">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newTrait}
              onChange={(e) => setNewTrait(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTrait(newTrait)}
              placeholder="Neue Eigenschaft eingeben…"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => addTrait(newTrait)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_TRAITS.filter((t) => !form.traits.includes(t)).map((t) => (
              <button
                key={t}
                onClick={() => addTrait(t)}
                className="px-2.5 py-1 text-xs border border-dashed border-slate-300 text-slate-500 rounded-full hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                + {t}
              </button>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield size={14} /> Verhaltensregeln
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Diese Regeln werden wörtlich in den System-Prompt übernommen.
          </p>
          <div className="space-y-2 mb-3">
            {form.rules.map((rule, i) => (
              <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-slate-400 mt-0.5">–</span>
                <span className="flex-1 text-slate-700">{rule}</span>
                <button onClick={() => removeRule(i)} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRule()}
              placeholder="Neue Regel eingeben (z.B. Schließe immer mit einer Grußformel)…"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={addRule}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </section>

        {/* Operation Mode */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Gauge size={14} /> Betriebsmodus
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Steuert, was {form.name} eigenständig tun darf. Empfehlung: mit "Sandbox" beginnen.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MODE_OPTIONS.map(({ value, label, description, Icon }) => (
              <button
                key={value}
                onClick={() => setForm({ ...form, mode: value })}
                className={`text-left p-4 rounded-xl border-2 transition-all ${modeColor(value, form.mode === value)}`}
              >
                <div className={`flex items-center gap-2 mb-1 font-semibold text-sm ${form.mode === value ? modeTextColor(value) : "text-slate-700"}`}>
                  <Icon size={16} />
                  {label}
                </div>
                <p className={`text-xs leading-relaxed ${form.mode === value ? modeTextColor(value) : "text-slate-500"}`}>
                  {description}
                </p>
              </button>
            ))}
          </div>

          {form.mode !== "sandbox" && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Hinweis:</strong> Der Modus "{MODE_OPTIONS.find(m => m.value === form.mode)?.label}" erlaubt {form.name},
              eigenständig zu handeln. Stelle sicher, dass alle relevanten Skills korrekt konfiguriert sind, bevor du diesen Modus aktivierst.
            </div>
          )}
        </section>

        {/* Last updated */}
        {saved?.updatedAt && (
          <p className="text-xs text-slate-400 text-right">
            Zuletzt gespeichert: {new Date(saved.updatedAt).toLocaleString("de-DE")}
          </p>
        )}
      </div>
    </div>
  );
}
