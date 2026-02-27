<p align="center">
  <strong>CoreClaw</strong>
</p>

<p align="center">
  KI-Agent-Orchestrierung für Unternehmen. Mehrere Dirigenten, strukturierte Workflows, Container-Isolation.
</p>

<p align="center">
  <a href="README.md">English</a>&nbsp; • &nbsp;
  <a href="ROADMAP.md">Roadmap</a>&nbsp; • &nbsp;
  <a href="docs/">Dokumentation</a>
</p>

## Warum CoreClaw

KI-Agents sind einzeln leistungsfähig, aber im Business-Einsatz entsteht ein neues Problem: **Agent Fatigue** — nicht der Agent wird müde, sondern *du*. Du startest mehrere Aufgaben, jeder Agent läuft unabhängig, und plötzlich bist du der Flaschenhals: Outputs prüfen, Kontext wechseln, Ergebnisse zusammenführen. Du wirst zum Orchestrator, und das skaliert nicht.

Bestehende Projekte lösen andere Probleme:

- **[NanoClaw](https://github.com/qwibitai/NanoClaw)** ist ein persönlicher KI-Assistent — ein Nutzer, ein Chat, Container-isolierte Agents. Elegant und sicher, aber für Einzelpersonen gedacht, nicht für Teams oder Business-Workflows.
- **[OpenClaw](https://github.com/openclaw/openclaw)** ist eine Komplettplattform — jeder Kanal, jedes OS, jedes Feature. Leistungsfähig, aber komplex (500k+ Zeilen, 70+ Abhängigkeiten). Business-spezifische Orchestrierung ist nicht der Fokus.

**CoreClaw** füllt die Lücke: eine geschäftsfokussierte Orchestrierungsschicht für KI-Agents. Statt eines einzelnen Orchestrators, der alles steuert, führt CoreClaw **mehrere Dirigenten** ein — spezialisierte Rollen, die jeweils einen Aspekt der Agent-Arbeit verantworten. Der Mensch behält die Kontrolle, hört aber auf, der Sortierer, Prüfer und Zusammenfasser zu sein.

## Kernkonzepte

### Dirigenten statt eines einzelnen Orchestrators

CoreClaw nutzt **Dirigenten** (Conductors) — spezialisierte Orchestrierungsrollen, die jeweils eine bestimmte Aufgabe übernehmen:

| Dirigent | Rolle | Verantwortung |
|----------|-------|---------------|
| **Chefdirigent** | Überblick | Aggregiert Status aller Dirigenten, erstellt Briefings, eskaliert an Menschen |
| **Postmeister** | Triage | Kategorisiert eingehende Nachrichten (E-Mail, Tickets, Chats), leitet an den richtigen Agent oder Workflow weiter |
| **Wächter** | Qualitätssicherung | Prüft Agent-Outputs vor dem Versand — Tonalität, Fakten, Policy-Konformität |
| **Planer** | Workflow | Zerlegt komplexe Aufgaben in Schritte, verwaltet Abhängigkeiten, führt Ergebnisse zusammen |
| **Archivar** | Kontext | Verwaltet Wissen — vergangene Unterhaltungen, relevante Daten, hält den Kontext frisch und relevant |
| **Lehrmeister** | Verbesserung | Analysiert Feedback, erkennt Muster, schlägt Prompt-Verbesserungen vor |

Nicht jeder Dirigent ist ein vollwertiger Agent. Manche sind Host-Logik (z. B. Postmeister als Regelwerk), manche sind Agents im Container (z. B. Wächter), manche sind Infrastruktur (z. B. Archivar als Retrieval-Schicht).

### Business-Kanäle zuerst

CoreClaw priorisiert die Kanäle, die Unternehmen tatsächlich nutzen:

- **E-Mail** (Gmail, Outlook/Exchange) — der universelle Geschäftskanal
- **Microsoft Teams** — Enterprise-Chat und Zusammenarbeit
- **Slack** — Team-Kommunikation, Integrationen
- **Google Chat** — Google-Workspace-Organisationen
- **Ticketing-Systeme** (Jira, Zendesk, Freshdesk) — Support und Projektmanagement
- **Webhooks / APIs** — System-zu-System-Kommunikation

Consumer-Kanäle (WhatsApp, Telegram, Discord) sind nicht im Kern enthalten, können aber über Skills hinzugefügt werden.

### Container-Isolation

Wie bei NanoClaw laufen alle Agents in **Containern** (Docker). Sie können nur sehen, was explizit gemountet wird. Bash-Befehle laufen im Container, nicht auf dem Host. Das ist Isolation auf OS-Ebene, nicht auf Anwendungsebene.

### Strukturierter Agent-Output

Agents liefern nicht nur Freitext. Sie liefern strukturierte Ergebnisse:

```json
{
  "status": "completed",
  "priority": "normal",
  "summary": "3 Support-E-Mails beantwortet, 1 an Mensch eskaliert",
  "needsReview": false,
  "outputs": [...],
  "metadata": { "tokens": 4200, "duration_ms": 12000 }
}
```

So kann der Chefdirigent aggregieren, der Wächter prüfen und das Dashboard anzeigen — ohne dass der Mensch jeden Roh-Output liest.

### Freigabe-Workflows

Nicht alles soll automatisch rausgehen. CoreClaw unterstützt:

- **Auto-Freigabe** — Routine-Antworten, die etablierten Mustern entsprechen
- **Entwurf → Prüfung → Versand** — Agent erstellt Entwurf, Mensch bestätigt mit einer Aktion
- **Eskalation** — Agent erkennt Unsicherheit und leitet an einen Menschen weiter, statt zu raten

## Architektur

```
                         ┌──────────────────┐
                         │  Chefdirigent     │  → Briefings, Eskalation
                         └────────┬─────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                       ▼
  ┌─────────────────┐   ┌─────────────────┐    ┌─────────────────┐
  │  Postmeister     │   │  Planer          │    │  Wächter         │
  │  (Triage)        │   │  (Plan & Merge)  │    │  (Qualität)      │
  └────────┬────────┘   └────────┬────────┘    └────────┬────────┘
           │                     │                       │
           ▼                     ▼                       ▼
      ┌─────────┐         ┌───────────┐           ┌───────────┐
      │ Agent A  │         │ Agent B+C │           │ Output     │
      │ (E-Mail) │         │ (parallel)│           │ prüfen     │
      └─────────┘         └───────────┘           └───────────┘
           │                     │                       │
           └─────────────────────┴───────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │       Archivar             │  → RAG, Historie, relevante Daten
                    │       Lehrmeister          │  → Feedback, Prompt-Verbesserung
                    └───────────────────────────┘
```

### Zentrale Komponenten

| Komponente | Zweck |
|-----------|-------|
| `src/index.ts` | Host-Prozess: Kanäle, Queue, Dirigenten-Koordination |
| `src/conductors/` | Dirigenten-Implementierungen (Chef, Postmeister, Wächter, Planer, Archivar, Lehrmeister) |
| `src/channels/` | Kanal-Adapter (E-Mail, Teams, Slack, Google Chat, Webhooks) |
| `src/queue.ts` | Task-Queue mit Priorität, Concurrency-Limits, Retry-Logik |
| `src/container-runner.ts` | Startet Agent-Container mit Mounts und Secrets |
| `src/db.ts` | SQLite: Nachrichten, Tasks, Sessions, Feedback, Prompt-Versionen |
| `container/agent-runner/` | Agent-Logik im Container (Claude Agent SDK) |
| `conductors/{name}/` | Pro-Dirigent-Konfiguration und Memory |

### Datenfluss (Beispiel: Eingehende E-Mail)

1. **E-Mail kommt an** → Kanal-Adapter speichert in DB
2. **Postmeister** sichtet: Kategorie, Priorität, benötigter Kontext
3. **Archivar** liefert: vergangene Unterhaltungen, Kundendaten, relevante Dokumente
4. **Planer** entscheidet: einfach (ein Agent) oder komplex (mehrstufig)
5. **Agent(s)** arbeiten im Container, liefern strukturierten Output
6. **Wächter** prüft: Tonalität, Genauigkeit, Policy — gibt frei, korrigiert oder eskaliert
7. **Chefdirigent** aktualisiert Dashboard: „3 erledigt, 1 braucht deine Prüfung"
8. **Lehrmeister** protokolliert: was funktioniert hat, was korrigiert wurde, Musteranalyse

## Erste Schritte

### Voraussetzungen

- macOS oder Linux
- Node.js 22+
- Docker
- [Claude Code](https://claude.ai/download) (für Setup und Anpassung)

### Schnellstart

```bash
git clone https://github.com/ostheimer/coreclaw.git
cd coreclaw
claude
```

Dann `/setup` ausführen. Claude Code führt durch: Abhängigkeiten, Container-Build, Kanal-Konfiguration und Dirigenten-Setup.

### Konfiguration

CoreClaw nutzt minimale Konfiguration. Geschäftsspezifisches Verhalten steckt in Dirigenten-Regeln und Prompt-Dateien, nicht in ausufernden Config-Objekten.

```
.env                          # Secrets (API-Keys, Tokens)
conductors/chief/rules.md     # Chefdirigent-Anweisungen
conductors/inbox/rules.md     # Triage-Regeln und Routing
conductors/quality/rules.md   # Output-Qualitätsstandards
prompts/                      # Versionierte Prompt-Templates
```

## Anpassung

Wie NanoClaw ist CoreClaw darauf ausgelegt, über Code-Änderungen und Skills angepasst zu werden:

- „Jira als Ticket-Quelle hinzufügen" → `/add-jira`
- „Freigabe-Workflow für Support-E-Mails ändern" → Dirigenten-Regeln anpassen
- „Neuen Dirigenten für Compliance hinzufügen" → neues Dirigenten-Modul erstellen

Die Codebasis bleibt klein genug, damit Claude Code sie sicher ändern kann.

## Was CoreClaw unterscheidet

| | NanoClaw | OpenClaw | CoreClaw |
|---|---------|----------|----------|
| **Fokus** | Persönlicher Assistent | Universalplattform | Business-Orchestrierung |
| **Kanäle** | WhatsApp, Telegram | Alles (15+) | E-Mail, Teams, Slack, Tickets |
| **Orchestrierung** | Eine Queue, ein Agent pro Gruppe | Gateway + Sessions | Mehrere Dirigenten mit Rollen |
| **Agent-Isolation** | Immer containerisiert | Standard Host, optional Sandbox | Immer containerisiert |
| **Output-Format** | Freitext | Freitext | Strukturiert (Status, Priorität, Review-Flag) |
| **Freigabe-Workflow** | Keiner | Keiner | Entwurf → Prüfung → Versand, Auto-Freigabe-Regeln |
| **Agent-Koordination** | Innerhalb Gruppe (Swarms) | Session-zu-Session | Dirigenten-übergreifend + Shared Results |
| **Prompt-Management** | CLAUDE.md-Dateien | AGENTS.md + Workspace | Versionierte Prompts mit Feedback-Loop |
| **Qualitätskontrolle** | Keine | Keine | Wächter-Dirigent (Guard Rails) |
| **Dashboard** | Nur Chat | Control UI | Unified Inbox mit Status und Prioritäten |
| **Codebasis** | ~10k Zeilen | ~500k Zeilen | Ziel: ~15–20k Zeilen |

## Philosophie

**Business-first.** Kanäle, Workflows und Defaults sind für Business-Anwendungen gewählt, nicht für persönliche Assistenten oder Entwickler-Tools.

**Mehrere Dirigenten statt eines Orchestrators.** Jedes Anliegen (Triage, Qualität, Planung, Memory, Lernen) hat seinen eigenen Dirigenten mit klaren Verantwortlichkeiten. Der Mensch entscheidet; das System sortiert, prüft und fasst zusammen.

**Strukturiert statt Freiform.** Agent-Outputs haben Form. Dashboards funktionieren, weil Daten strukturiert sind. Freigabe-Workflows funktionieren, weil Outputs Review-Flags haben.

**Klein genug zum Verstehen.** Wie NanoClaw soll die Codebasis lesbar sein. Das Ziel sind 15–20k Zeilen TypeScript, keine Plattform mit Hunderttausenden Zeilen.

**Sicher durch Isolation.** Agents laufen in Containern. Immer. Ohne Ausnahme.

**Prompt-Verbesserung ist ein Kernanliegen.** Prompts sind keine statischen Dateien, die man einmal setzt. Sie werden versioniert, gemessen und auf Basis von Feedback verbessert.

## Inspiration und Attribution

CoreClaw baut auf Ideen und Mustern aus folgenden Projekten auf:

- **[NanoClaw](https://github.com/qwibitai/NanoClaw)** — Container-Isolation, Single-Process-Architektur, Skills-over-Features-Philosophie
- **[OpenClaw](https://github.com/openclaw/openclaw)** — Kanal-Abstraktion, Session-Modell, Multi-Channel-Architektur

## Lizenz

MIT
