import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Play,
  Square,
  Shield,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { usePolling } from "../hooks/usePolling";

interface M365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
  syncIntervalSec: number;
  folder: string;
  markAsRead: boolean;
}

interface EmailStatus {
  configured: boolean;
  syncing: boolean;
  syncState: { deltaLink: string | null; lastSyncAt: string; messagesProcessed: number } | null;
}

const EMPTY_CONFIG: M365Config = {
  tenantId: "",
  clientId: "",
  clientSecret: "",
  mailbox: "",
  syncIntervalSec: 60,
  folder: "Inbox",
  markAsRead: true,
};

const STEPS = [
  { title: "Azure AD App", icon: Shield },
  { title: "Verbindung testen", icon: RefreshCw },
  { title: "Postfach wählen", icon: Mail },
  { title: "Ordner & Optionen", icon: FolderOpen },
  { title: "Fertig", icon: CheckCircle2 },
];

export function EmailSetup() {
  const statusFetcher = useCallback(
    () => fetch("/api/email/status").then((r) => r.json()) as Promise<EmailStatus>,
    [],
  );
  const { data: status, refresh: refreshStatus } = usePolling<EmailStatus>(statusFetcher, 5000);

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<M365Config>(EMPTY_CONFIG);
  const [showWizard, setShowWizard] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    void fetch("/api/email/config")
      .then((r) => r.json())
      .then((data: M365Config & { configured: boolean }) => {
        if (data.configured) {
          setConfig((prev) => ({
            ...prev,
            tenantId: data.tenantId ?? "",
            clientId: data.clientId ?? "",
            mailbox: data.mailbox ?? "",
            syncIntervalSec: data.syncIntervalSec ?? 60,
            folder: data.folder ?? "Inbox",
            markAsRead: data.markAsRead ?? true,
          }));
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  if (!showWizard && status?.configured) {
    return <ConfiguredView status={status} config={config} onReconfigure={() => setShowWizard(true)} onRefresh={refreshStatus} />;
  }

  if (!showWizard && !status?.configured) {
    return <WelcomeView onStart={() => setShowWizard(true)} />;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Mail size={24} />
        E-Mail einrichten — Microsoft 365
      </h1>

      {/* Step Indicator */}
      <div className="flex items-center mb-8 gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={i} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${active ? "bg-blue-100 text-blue-700" : done ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-slate-50 text-slate-400"}`}
              >
                {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                {s.title}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300 mx-0.5" />}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {step === 0 && <Step0AzureAd config={config} setConfig={setConfig} onNext={() => setStep(1)} />}
      {step === 1 && <Step1Test config={config} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <Step2Mailbox config={config} setConfig={setConfig} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <Step3Options config={config} setConfig={setConfig} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
      {step === 4 && (
        <Step4Save
          config={config}
          onDone={() => {
            setShowWizard(false);
            refreshStatus();
          }}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}

// ---------- Step 0: Azure AD Anleitung + Zugangsdaten inline ----------

function Step0AzureAd({
  config,
  setConfig,
  onNext,
}: {
  config: M365Config;
  setConfig: (c: M365Config) => void;
  onNext: () => void;
}) {
  const valid = config.tenantId.length > 10 && config.clientId.length > 10 && config.clientSecret.length > 5;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Schritt 1: Azure AD App registrieren</h2>
      <p className="text-sm text-slate-600 mb-4">
        CoreClaw benötigt eine App-Registrierung in Ihrem Azure AD, um auf E-Mails zugreifen zu können.
        Das ist ein einmaliger Vorgang.
      </p>

      <ol className="space-y-6 text-sm text-slate-700 mb-6">
        {/* 1. Azure Portal öffnen */}
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
          <div>
            <p className="font-medium">Öffnen Sie das Azure Portal</p>
            <a
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
            >
              Azure AD → App-Registrierungen <ExternalLink size={12} />
            </a>
          </div>
        </li>

        {/* 2. Registrierung erstellen */}
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
          <div>
            <p className="font-medium">Neue Registrierung erstellen</p>
            <p className="text-slate-500 mt-1">
              Name: <code className="bg-slate-100 px-1.5 py-0.5 rounded">CoreClaw Email</code>
            </p>
            <p className="text-slate-500 mt-1">
              Unterstützte Kontotypen: Wählen Sie die <strong>erste Option</strong> im Dropdown:<br />
              <code className="bg-slate-100 px-1.5 py-0.5 rounded">Nur ein Mandant – [Ihr Organisationsname]</code><br />
              <span className="text-xs text-slate-400">(CoreClaw greift nur auf Postfächer in Ihrer eigenen Organisation zu)</span>
            </p>
            <p className="text-slate-500 mt-1">
              Umleitungs-URI: <strong>leer lassen</strong> (Server-zu-Server-Flow ohne Browser-Login)
            </p>
            <p className="text-slate-500 mt-1">
              Dann auf <strong>Registrieren</strong> klicken.
            </p>
          </div>
        </li>

        {/* 3. IDs direkt einfügen */}
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
          <div className="flex-1">
            <p className="font-medium">IDs von der Übersichtsseite einfügen</p>
            <p className="text-slate-500 mt-1">
              Nach dem Registrieren öffnet sich die <strong>Übersicht</strong>.
              Kopieren Sie die Werte aus der <strong>Zusammenfassung</strong> direkt hier hinein:
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Anwendungs-ID (Client) — im Azure Portal: "Anwendungs-ID (Client)"
                </label>
                <input
                  type="text"
                  value={config.clientId}
                  onChange={(e) => setConfig({ ...config, clientId: e.target.value.trim() })}
                  placeholder="z.B. a31871c3-caab-45e6-8671-f5f7c098898e"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Verzeichnis-ID (Mandant) — im Azure Portal: "Verzeichnis-ID (Mandant)"
                </label>
                <input
                  type="text"
                  value={config.tenantId}
                  onChange={(e) => setConfig({ ...config, tenantId: e.target.value.trim() })}
                  placeholder="z.B. f7a9988d-8286-4395-9f4a-c38f7a41c599"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>
            </div>
            {config.tenantId.length > 10 && config.clientId.length > 10 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600">
                <CheckCircle2 size={12} />
                IDs eingefügt
              </div>
            )}
          </div>
        </li>

        {/* 4. Client Secret */}
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
          <div className="flex-1">
            <p className="font-medium">Client Secret erstellen</p>
            <p className="text-slate-500 mt-1">
              Bleiben Sie in der App-Registrierung und klicken Sie im <strong>linken Menü</strong> unter <strong>Verwalten</strong> auf:
            </p>
            <p className="text-slate-500 mt-1">
              <strong>Zertifikate & Geheimnisse</strong> → Reiter <strong>Geheime Clientschlüssel</strong> → <strong>Neuer geheimer Clientschlüssel</strong>
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded p-3 mt-2 space-y-1 text-sm">
              <div>Beschreibung: <code className="bg-white px-1.5 py-0.5 rounded border text-xs">CoreClaw</code></div>
              <div>Gültig bis: <strong>24 Monate</strong> (empfohlen)</div>
              <div>Dann auf <strong>Hinzufügen</strong> klicken.</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-2 mt-2 text-xs text-red-700">
              <strong>Achtung:</strong> Nach dem Hinzufügen erscheint eine Tabelle.
              Kopieren Sie den <strong>Wert</strong> (die lange Zeichenkette) — <strong>nicht</strong> die "Geheimnis-ID"!
              Der Wert wird <strong>nur einmal</strong> angezeigt.
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Geheimer Clientschlüssel (Wert) — hier einfügen:
              </label>
              <input
                type="password"
                value={config.clientSecret}
                onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
                placeholder="Den Wert aus der Tabelle hier einfügen"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Wird lokal verschlüsselt gespeichert — niemals im Klartext.</p>
            </div>
            {config.clientSecret.length > 5 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600">
                <CheckCircle2 size={12} />
                Secret eingefügt
              </div>
            )}
          </div>
        </li>

        {/* 5. API Berechtigungen */}
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">5</span>
          <div>
            <p className="font-medium">API-Berechtigungen setzen</p>
            <p className="text-slate-500 mt-1">
              <strong>API-Berechtigungen</strong> (im linken Menü) → <strong>Berechtigung hinzufügen</strong> → <strong>Microsoft Graph</strong> → <strong>Anwendungsberechtigungen</strong>
            </p>
            <p className="text-slate-500 mt-1">
              Suchen und aktivieren Sie diese vier Berechtigungen:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">Mail.Read</code>
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">Mail.ReadWrite</code>
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">Mail.Send</code>
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">User.Read.All</code>
            </div>
            <p className="text-slate-500 mt-2">
              Dann oben auf <strong>Administratorzustimmung für [Ihre Organisation] erteilen</strong> klicken und bestätigen.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Alle vier Berechtigungen sollten danach einen grünen Haken zeigen.
            </p>
          </div>
        </li>
      </ol>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
        <strong>Wichtig:</strong> Sie benötigen Azure AD Administrator-Rechte, um die Administratorzustimmung zu erteilen.
        Nur Benutzer mit der Rolle <em>Globaler Administrator</em> oder <em>Anwendungsadministrator</em> können dies tun.
      </div>

      {/* Validation summary */}
      {!valid && (config.tenantId || config.clientId || config.clientSecret) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500 mb-4">
          Noch fehlend:{" "}
          {config.tenantId.length <= 10 && <span className="text-amber-600 font-medium">Verzeichnis-ID </span>}
          {config.clientId.length <= 10 && <span className="text-amber-600 font-medium">Anwendungs-ID </span>}
          {config.clientSecret.length <= 5 && <span className="text-amber-600 font-medium">Client Secret </span>}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!valid}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Weiter — Verbindung testen <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Step 1: Verbindungstest ----------

function Step1Test({
  config,
  onNext,
  onBack,
}: {
  config: M365Config;
  onNext: () => void;
  onBack: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; displayName?: string; mailbox?: string; error?: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json() as { success: boolean; displayName?: string; mailbox?: string; error?: string };
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Schritt 2: Verbindung testen</h2>
      <p className="text-sm text-slate-500 mb-4">
        Jetzt prüfen wir, ob CoreClaw sich bei Microsoft 365 anmelden kann.
      </p>

      {!config.mailbox && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Zu testende E-Mail-Adresse
          </label>
          <input
            type="email"
            value={config.mailbox}
            readOnly
            placeholder="Wird im nächsten Schritt gewählt"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">
            Der Verbindungstest prüft nur die Azure AD Authentifizierung — kein Postfach nötig.
          </p>
        </div>
      )}

      <button
        onClick={() => void runTest()}
        disabled={testing}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 mb-4"
      >
        {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {testing ? "Wird getestet..." : "Verbindung testen"}
      </button>

      {result && (
        <div className={`rounded-lg p-4 text-sm mb-4 ${result.success ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
          {result.success ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Verbindung erfolgreich! Azure AD Authentifizierung funktioniert.</span>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <XCircle size={16} />
                <span className="font-medium">Verbindung fehlgeschlagen</span>
              </div>
              <p className="ml-6">{result.error}</p>
              <p className="ml-6 mt-2 text-xs text-red-600">
                Prüfen Sie: Tenant ID, Client ID, Client Secret korrekt? Admin-Zustimmung erteilt?
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          <ChevronLeft size={14} /> Zurück
        </button>
        <button
          onClick={onNext}
          disabled={!result?.success}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Weiter <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Step 2: Postfach wählen ----------

function Step2Mailbox({
  config,
  setConfig,
  onNext,
  onBack,
}: {
  config: M365Config;
  setConfig: (c: M365Config) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [mailboxes, setMailboxes] = useState<Array<{ email: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const loadMailboxes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json() as Array<{ email: string; displayName: string }>;
      if (Array.isArray(data)) {
        setMailboxes(data);
      } else {
        setError("Konnte Postfächer nicht laden");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMailboxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Schritt 3: Postfach auswählen</h2>
      <p className="text-sm text-slate-500 mb-4">
        Welches Postfach soll CoreClaw überwachen? Typisch: ein Shared Mailbox wie <code className="bg-slate-100 px-1 py-0.5 rounded">support@firma.com</code>
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <Loader2 size={14} className="animate-spin" /> Lade Postfächer...
        </div>
      )}

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
          {error}
        </div>
      )}

      {mailboxes.length > 0 && (
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {mailboxes.map((m) => (
            <button
              key={m.email}
              onClick={() => setConfig({ ...config, mailbox: m.email })}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors
                ${config.mailbox === m.email
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                }`}
            >
              <span className="font-medium">{m.displayName}</span>
              <span className="text-slate-500 ml-2">{m.email}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Oder manuell eingeben
        </label>
        <input
          type="email"
          value={config.mailbox}
          onChange={(e) => setConfig({ ...config, mailbox: e.target.value.trim() })}
          placeholder="support@firma.com"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
        />
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          <ChevronLeft size={14} /> Zurück
        </button>
        <button
          onClick={onNext}
          disabled={!config.mailbox}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Weiter <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Step 3: Ordner & Optionen ----------

function Step3Options({
  config,
  setConfig,
  onNext,
  onBack,
}: {
  config: M365Config;
  setConfig: (c: M365Config) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [folders, setFolders] = useState<Array<{ displayName: string; totalItemCount: number; unreadItemCount: number }>>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    if (!config.mailbox) return;
    setLoadingFolders(true);
    void fetch("/api/email/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setFolders(data as Array<{ displayName: string; totalItemCount: number; unreadItemCount: number }>);
      })
      .finally(() => setLoadingFolders(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.mailbox]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Schritt 4: Ordner & Optionen</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Überwachter Ordner
          </label>
          {loadingFolders ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Lade Ordner...
            </div>
          ) : folders.length > 0 ? (
            <select
              value={config.folder}
              onChange={(e) => setConfig({ ...config, folder: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {folders.map((f) => (
                <option key={f.displayName} value={f.displayName}>
                  {f.displayName} ({f.unreadItemCount} ungelesen / {f.totalItemCount} gesamt)
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={config.folder}
              onChange={(e) => setConfig({ ...config, folder: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Sync-Intervall (Sekunden)
          </label>
          <input
            type="number"
            min={15}
            max={600}
            value={config.syncIntervalSec}
            onChange={(e) => setConfig({ ...config, syncIntervalSec: parseInt(e.target.value, 10) || 60 })}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <p className="text-xs text-slate-400 mt-1">Wie oft nach neuen E-Mails gesucht wird (min. 15 Sekunden)</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={config.markAsRead}
            onChange={(e) => setConfig({ ...config, markAsRead: e.target.checked })}
            className="rounded border-slate-300"
          />
          E-Mails nach dem Verarbeiten als gelesen markieren
        </label>
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          <ChevronLeft size={14} /> Zurück
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Weiter <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Step 4: Speichern & Starten ----------

function Step4Save({
  config,
  onDone,
  onBack,
}: {
  config: M365Config;
  onDone: () => void;
  onBack: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await fetch("/api/email/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      await fetch("/api/email/start", { method: "POST" });
      setSaved(true);
      setTimeout(onDone, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Schritt 5: Zusammenfassung & Start</h2>

      <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2 mb-6">
        <div className="flex justify-between">
          <span className="text-slate-500">Postfach:</span>
          <span className="font-medium text-slate-900 font-mono">{config.mailbox}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Ordner:</span>
          <span className="font-medium text-slate-900">{config.folder}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Sync-Intervall:</span>
          <span className="font-medium text-slate-900">{config.syncIntervalSec}s</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Als gelesen markieren:</span>
          <span className="font-medium text-slate-900">{config.markAsRead ? "Ja" : "Nein"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tenant ID:</span>
          <span className="font-mono text-xs text-slate-500">{config.tenantId.slice(0, 8)}...{config.tenantId.slice(-4)}</span>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-center gap-2 mb-4">
          <CheckCircle2 size={16} />
          Konfiguration gespeichert & E-Mail-Sync gestartet!
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4">
          {error}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          <ChevronLeft size={14} /> Zurück
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || saved}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {saving ? "Wird gespeichert..." : saved ? "Gespeichert!" : "Speichern & Starten"}
        </button>
      </div>
    </div>
  );
}

// ---------- Configured View (Dashboard) ----------

function ConfiguredView({
  status,
  config,
  onReconfigure,
  onRefresh,
}: {
  status: EmailStatus;
  config: M365Config;
  onReconfigure: () => void;
  onRefresh: () => void;
}) {
  const [toggling, setToggling] = useState(false);

  const toggleSync = async () => {
    setToggling(true);
    try {
      if (status.syncing) {
        await fetch("/api/email/stop", { method: "POST" });
      } else {
        await fetch("/api/email/start", { method: "POST" });
      }
      onRefresh();
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail size={24} />
            E-Mail — Microsoft 365
          </h1>
          <p className="text-sm text-slate-500 mt-1">{config.mailbox || "Konfiguriert"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
            status.syncing ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
          }`}>
            <span className={`w-2 h-2 rounded-full ${status.syncing ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
            {status.syncing ? "Sync aktiv" : "Gestoppt"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Status</p>
          <p className={`text-lg font-semibold ${status.syncing ? "text-green-600" : "text-slate-500"}`}>
            {status.syncing ? "Synchronisiert" : "Angehalten"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Verarbeitete E-Mails</p>
          <p className="text-lg font-semibold text-slate-900">
            {status.syncState?.messagesProcessed ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Letzter Sync</p>
          <p className="text-sm font-medium text-slate-700">
            {status.syncState?.lastSyncAt
              ? new Date(status.syncState.lastSyncAt).toLocaleString("de-DE")
              : "—"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => void toggleSync()}
          disabled={toggling}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            status.syncing
              ? "text-red-700 bg-red-50 hover:bg-red-100"
              : "text-white bg-green-600 hover:bg-green-700"
          }`}
        >
          {toggling ? <Loader2 size={14} className="animate-spin" /> : status.syncing ? <Square size={14} /> : <Play size={14} />}
          {status.syncing ? "Sync stoppen" : "Sync starten"}
        </button>
        <button
          onClick={onReconfigure}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
        >
          Neu konfigurieren
        </button>
      </div>
    </div>
  );
}

// ---------- Welcome View ----------

function WelcomeView({ onStart }: { onStart: () => void }) {
  return (
    <div className="p-8">
      <div className="max-w-xl mx-auto text-center pt-12">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Mail size={32} className="text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">E-Mail-Kanal einrichten</h1>
        <p className="text-slate-500 mb-6">
          Verbinden Sie CoreClaw mit Ihrem Microsoft 365 / Exchange-Postfach.
          Der Einrichtungsassistent führt Sie Schritt für Schritt durch die Konfiguration.
        </p>
        <p className="text-sm text-slate-400 mb-8">
          Sie benötigen: Azure AD Admin-Zugang, eine App-Registrierung, und das Postfach, das überwacht werden soll.
        </p>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Shield size={16} />
          Einrichtung starten
        </button>
      </div>
    </div>
  );
}
