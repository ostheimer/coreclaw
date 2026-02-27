import { Settings as SettingsIcon, Server, Database, Box } from "lucide-react";

export function Settings() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-sm text-slate-500 mt-1">
          System-Konfiguration und Verbindungen
        </p>
      </div>

      <div className="space-y-4">
        <SettingSection
          icon={<Server size={18} />}
          title="Channels"
          description="E-Mail, Teams, Slack und andere Kanäle verbinden"
        >
          <p className="text-sm text-slate-500">
            Noch keine Channels konfiguriert. In Phase 2 wird der E-Mail-Channel verfügbar.
          </p>
        </SettingSection>

        <SettingSection
          icon={<Database size={18} />}
          title="Datenquellen"
          description="WordPress, CRM und andere Systeme anbinden"
        >
          <p className="text-sm text-slate-500">
            Knowledge Sources werden in einer zukünftigen Version verfügbar sein (WordPress REST API, MCP).
          </p>
        </SettingSection>

        <SettingSection
          icon={<Box size={18} />}
          title="Agenten"
          description="Container-Images und Agent-Konfiguration"
        >
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Agent-Image</span>
              <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">coreclaw-agent:latest</code>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Concurrency</span>
              <span className="text-slate-700">3</span>
            </div>
          </div>
        </SettingSection>

        <SettingSection
          icon={<SettingsIcon size={18} />}
          title="System"
          description="Allgemeine Einstellungen"
        >
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Datenbank</span>
              <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">data/coreclaw.db</code>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Version</span>
              <span className="text-slate-700">0.1.0</span>
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}

function SettingSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="text-slate-500">{icon}</div>
        <div>
          <h3 className="font-medium text-slate-900 text-sm">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
