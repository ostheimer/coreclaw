import { useCallback, useState } from "react";
import {
  Puzzle,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  GitBranch,
  FileCode,
} from "lucide-react";
import { api, type AvailableSkill, type SkillState } from "../lib/api";
import { usePolling } from "../hooks/usePolling";

export function Skills() {
  const skillsFetcher = useCallback(() => api.getSkills(), []);
  const stateFetcher = useCallback(() => api.getSkillState(), []);
  const { data: skills, refresh: refreshSkills } = usePolling<AvailableSkill[]>(skillsFetcher, 10000);
  const { data: state, refresh: refreshState } = usePolling<SkillState>(stateFetcher, 10000);

  const refresh = () => {
    refreshSkills();
    refreshState();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skills</h1>
          <p className="text-sm text-slate-500 mt-1">
            Erweiterungen installieren und verwalten
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <GitBranch size={14} />
          <span>Engine v{state?.engineVersion ?? "..."}</span>
        </div>
      </div>

      {/* Installed Skills */}
      {state && state.appliedSkills.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500" />
            Installiert ({state.appliedSkills.length})
          </h2>
          <div className="space-y-3">
            {state.appliedSkills.map((s) => (
              <InstalledSkillCard
                key={s.name}
                name={s.name}
                version={s.version}
                appliedAt={s.appliedAt}
                fileCount={Object.keys(s.fileHashes).length}
                onUninstall={refresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available Skills */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Package size={16} className="text-blue-500" />
          Verfügbar
        </h2>

        {skills && skills.length > 0 ? (
          <div className="space-y-3">
            {skills
              .filter((s) => !s.installed)
              .map((skill) => (
                <AvailableSkillCard key={skill.name} skill={skill} onInstall={refresh} />
              ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <Puzzle size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">Keine Skills im <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">skills/</code> Verzeichnis gefunden.</p>
            <p className="text-xs text-slate-400 mt-2">
              Skills sind Erweiterungspakete mit einem <code>manifest.json</code>
            </p>
          </div>
        )}
      </div>

      {/* How Skills Work */}
      <div className="mt-8 bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <FileCode size={16} />
          Wie Skills funktionieren
        </h3>
        <ul className="text-sm text-slate-500 space-y-1">
          <li>Skills liegen im <code className="text-xs bg-white px-1 py-0.5 rounded border">skills/</code> Verzeichnis</li>
          <li>Jeder Skill hat ein <code className="text-xs bg-white px-1 py-0.5 rounded border">manifest.json</code>, <code className="text-xs bg-white px-1 py-0.5 rounded border">add/</code> und <code className="text-xs bg-white px-1 py-0.5 rounded border">modify/</code> Ordner</li>
          <li>Installation nutzt Three-Way-Merge — lokale Änderungen bleiben erhalten</li>
          <li>Jede Installation erstellt ein Backup — bei Fehler wird automatisch zurückgerollt</li>
          <li>Deinstallation stellt die Original-Dateien wieder her</li>
        </ul>
      </div>
    </div>
  );
}

function AvailableSkillCard({ skill, onInstall }: { skill: AvailableSkill; onInstall: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setResult(null);
    try {
      const res = await api.applySkill(skill.path);
      setResult({
        success: res.success,
        message: res.success
          ? `${res.filesAdded.length} Dateien hinzugefügt, ${res.filesModified.length} geändert (${res.durationMs}ms)`
          : res.error ?? "Unbekannter Fehler",
      });
      onInstall();
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm">{skill.name}</span>
            <span className="text-xs text-slate-400">v{skill.version}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{skill.description}</p>
          {skill.depends.length > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Benötigt: {skill.depends.join(", ")}
            </p>
          )}
        </div>
        <button
          onClick={() => void handleInstall()}
          disabled={installing}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {installing ? "Wird installiert..." : "Installieren"}
        </button>
      </div>
      {result && (
        <div className={`px-5 py-3 border-t text-sm ${result.success ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}>
          {result.success ? <CheckCircle2 size={14} className="inline mr-1" /> : <XCircle size={14} className="inline mr-1" />}
          {result.message}
        </div>
      )}
    </div>
  );
}

function InstalledSkillCard({
  name,
  version,
  appliedAt,
  fileCount,
  onUninstall,
}: {
  name: string;
  version: string;
  appliedAt: string;
  fileCount: number;
  onUninstall: () => void;
}) {
  const [uninstalling, setUninstalling] = useState(false);

  const handleUninstall = async () => {
    setUninstalling(true);
    try {
      await api.uninstallSkill(name);
      onUninstall();
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-green-200 shadow-sm px-5 py-4 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-500" />
          <span className="font-medium text-slate-900 text-sm">{name}</span>
          <span className="text-xs text-slate-400">v{version}</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Installiert am {new Date(appliedAt).toLocaleDateString("de-DE")} — {fileCount} Dateien
        </p>
      </div>
      <button
        onClick={() => void handleUninstall()}
        disabled={uninstalling}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        {uninstalling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        Deinstallieren
      </button>
    </div>
  );
}
