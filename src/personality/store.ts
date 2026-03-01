import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Personality } from "./types.js";
import { DEFAULT_PERSONALITY } from "./types.js";

// Resolve data dir relative to this source file — works regardless of cwd
const _dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(_dir, "../../data");
const PERSONALITY_FILE = join(DATA_DIR, "personality.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadPersonality(): Personality {
  ensureDataDir();
  if (!existsSync(PERSONALITY_FILE)) {
    savePersonality(DEFAULT_PERSONALITY);
    return { ...DEFAULT_PERSONALITY };
  }
  try {
    const raw = readFileSync(PERSONALITY_FILE, "utf-8");
    return JSON.parse(raw) as Personality;
  } catch {
    return { ...DEFAULT_PERSONALITY };
  }
}

export function savePersonality(p: Personality): void {
  ensureDataDir();
  const updated: Personality = { ...p, updatedAt: new Date().toISOString() };
  writeFileSync(PERSONALITY_FILE, JSON.stringify(updated, null, 2), "utf-8");
}

export function updatePersonality(partial: Partial<Omit<Personality, "updatedAt">>): Personality {
  const current = loadPersonality();
  const updated: Personality = { ...current, ...partial, updatedAt: new Date().toISOString() };
  savePersonality(updated);
  return updated;
}
