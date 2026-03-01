export type Tone = "formell" | "professionell" | "freundlich" | "locker";
export type Language = "de" | "en" | "fr" | "es" | "it";
export type OperationMode = "sandbox" | "suggest" | "assist" | "autonomous";

export interface Personality {
  /** Display name of the assistant, e.g. "CoreClaw" or "Alex" */
  name: string;
  /** One-sentence role description, e.g. "Freundlicher Support-Assistent für E-Mail-Anfragen" */
  role: string;
  /** Communication tone */
  tone: Tone;
  /** Default response language */
  language: Language;
  /** Character traits shown in responses, e.g. ["präzise", "empathisch", "lösungsorientiert"] */
  traits: string[];
  /** Explicit behavior rules appended verbatim to system prompt */
  rules: string[];
  /** Current operation mode — controls what the assistant is allowed to do */
  mode: OperationMode;
  /** ISO timestamp of last update */
  updatedAt: string;
}

export const MODE_DESCRIPTIONS: Record<OperationMode, { label: string; description: string; color: string }> = {
  sandbox: {
    label: "Sandbox",
    description: "Nur lesen. CoreClaw beobachtet und protokolliert, was es tun würde — handelt aber nicht.",
    color: "blue",
  },
  suggest: {
    label: "Vorschlag",
    description: "Erstellt Entwürfe zur Prüfung. Skills können lesen, aber noch nicht schreiben.",
    color: "amber",
  },
  assist: {
    label: "Assistenz",
    description: "Routine-Aufgaben werden automatisch erledigt. Komplexes geht zur Prüfung.",
    color: "green",
  },
  autonomous: {
    label: "Autonomie",
    description: "Handelt selbstständig. Nur Ausnahmen und Eskalationen kommen zum Menschen.",
    color: "purple",
  },
};

export const TONE_LABELS: Record<Tone, string> = {
  formell: "Formell",
  professionell: "Professionell",
  freundlich: "Freundlich-Professionell",
  locker: "Locker",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  es: "Spanisch",
  it: "Italienisch",
};

export const DEFAULT_PERSONALITY: Personality = {
  name: "CoreClaw",
  role: "Intelligenter Assistent für Geschäftskommunikation",
  tone: "professionell",
  language: "de",
  traits: ["präzise", "freundlich", "lösungsorientiert", "zuverlässig"],
  rules: [
    "Antworte immer in der Sprache, in der die Anfrage gestellt wurde",
    "Schließe E-Mails mit einer passenden Grußformel ab",
    "Fasse dich kurz und komme auf den Punkt",
  ],
  mode: "sandbox",
  updatedAt: new Date().toISOString(),
};
