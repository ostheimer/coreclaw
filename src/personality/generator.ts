import type { Personality, Tone, Language } from "./types.js";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  formell: "Verwende eine formelle, sachliche Sprache. Vermeide Umgangssprache. Sieze den Empfänger.",
  professionell: "Verwende eine professionelle, klare Sprache. Freundlich aber nicht persönlich.",
  freundlich: "Schreibe freundlich und nahbar. Professionell, aber mit persönlicher Note.",
  locker: "Schreibe locker und direkt. Duze den Empfänger sofern angemessen.",
};

const LANGUAGE_INSTRUCTIONS: Record<Language, string> = {
  de: "Antworte standardmäßig auf Deutsch, außer der Gesprächspartner schreibt in einer anderen Sprache.",
  en: "Respond in English by default, unless the other party writes in a different language.",
  fr: "Réponds en français par défaut, sauf si l'interlocuteur écrit dans une autre langue.",
  es: "Responde en español por defecto, a menos que el interlocutor escriba en otro idioma.",
  it: "Rispondi in italiano per impostazione predefinita, a meno che l'interlocutore non scriva in un'altra lingua.",
};

/**
 * Generates a structured system prompt from the personality configuration.
 * This prompt is prepended to all agent invocations.
 */
export function generateSystemPrompt(p: Personality): string {
  const lines: string[] = [];

  lines.push(`# Identität`);
  lines.push(`Du bist ${p.name}, ${p.role}.`);
  lines.push("");

  lines.push(`# Kommunikationsstil`);
  lines.push(TONE_INSTRUCTIONS[p.tone]);
  lines.push(LANGUAGE_INSTRUCTIONS[p.language]);
  lines.push("");

  if (p.traits.length > 0) {
    lines.push(`# Eigenschaften`);
    lines.push(`Du bist: ${p.traits.join(", ")}.`);
    lines.push("");
  }

  if (p.rules.length > 0) {
    lines.push(`# Verhaltensregeln`);
    for (const rule of p.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  lines.push(`# Betriebsmodus`);
  switch (p.mode) {
    case "sandbox":
      lines.push("Du befindest dich im SANDBOX-Modus. Du darfst ausschließlich lesen und analysieren.");
      lines.push("Beschreibe was du tun würdest, führe es aber NICHT aus.");
      lines.push("Sende keine Nachrichten, schreibe keine Dateien, ändere keine Daten.");
      break;
    case "suggest":
      lines.push("Du befindest dich im VORSCHLAGS-Modus. Du erstellst Entwürfe, die ein Mensch prüft.");
      lines.push("Erstelle keine endgültigen Aktionen ohne menschliche Freigabe.");
      break;
    case "assist":
      lines.push("Du befindest dich im ASSISTENZ-Modus. Routineaufgaben erledigst du selbstständig.");
      lines.push("Komplexe oder unklare Situationen legst du zur menschlichen Prüfung vor.");
      break;
    case "autonomous":
      lines.push("Du befindest dich im AUTONOMIE-Modus. Du handelst selbstständig.");
      lines.push("Eskaliere nur bei echten Ausnahmen oder wenn explizit nach menschlichem Input gefragt wird.");
      break;
  }

  return lines.join("\n");
}

/**
 * Returns a short one-line description of the personality for display purposes.
 */
export function describePersonality(p: Personality): string {
  return `${p.name} · ${p.role} · ${p.tone} · ${p.language.toUpperCase()}`;
}
