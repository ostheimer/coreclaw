import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { SkillState, AppliedSkill } from "./types.js";
import { ENGINE_VERSION } from "./types.js";

const CORECLAW_DIR = ".coreclaw";
const STATE_FILE = "state.json";
const BASE_DIR = "base";
const BACKUP_DIR = "backup";

export function getCoreclawDir(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, CORECLAW_DIR);
}

// ---------- Initialization ----------

export function initSkillsDir(projectRoot: string = process.cwd()): void {
  const ccDir = getCoreclawDir(projectRoot);
  fs.mkdirSync(path.join(ccDir, BASE_DIR), { recursive: true });
  fs.mkdirSync(path.join(ccDir, BACKUP_DIR), { recursive: true });

  if (!fs.existsSync(path.join(ccDir, STATE_FILE))) {
    writeState(emptyState(), projectRoot);
  }
}

export function isInitialized(projectRoot: string = process.cwd()): boolean {
  return fs.existsSync(path.join(getCoreclawDir(projectRoot), STATE_FILE));
}

// ---------- State Read/Write ----------

export function readState(projectRoot: string = process.cwd()): SkillState {
  const statePath = path.join(getCoreclawDir(projectRoot), STATE_FILE);
  if (!fs.existsSync(statePath)) return emptyState();

  const raw = fs.readFileSync(statePath, "utf-8");
  return JSON.parse(raw) as SkillState;
}

export function writeState(state: SkillState, projectRoot: string = process.cwd()): void {
  const statePath = path.join(getCoreclawDir(projectRoot), STATE_FILE);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function emptyState(): SkillState {
  return {
    engineVersion: ENGINE_VERSION,
    coreVersion: "0.1.0",
    appliedSkills: [],
    customModifications: [],
  };
}

// ---------- Skill Queries ----------

export function isSkillApplied(skillName: string, projectRoot?: string): boolean {
  const state = readState(projectRoot);
  return state.appliedSkills.some((s) => s.name === skillName);
}

export function getAppliedSkill(skillName: string, projectRoot?: string): AppliedSkill | null {
  const state = readState(projectRoot);
  return state.appliedSkills.find((s) => s.name === skillName) ?? null;
}

export function addAppliedSkill(skill: AppliedSkill, projectRoot?: string): void {
  const state = readState(projectRoot);
  state.appliedSkills = state.appliedSkills.filter((s) => s.name !== skill.name);
  state.appliedSkills.push(skill);
  writeState(state, projectRoot);
}

export function removeAppliedSkill(skillName: string, projectRoot?: string): void {
  const state = readState(projectRoot);
  state.appliedSkills = state.appliedSkills.filter((s) => s.name !== skillName);
  writeState(state, projectRoot);
}

// ---------- Base Snapshot ----------

export function snapshotFileToBase(relPath: string, projectRoot: string = process.cwd()): void {
  const src = path.join(projectRoot, relPath);
  const dest = path.join(getCoreclawDir(projectRoot), BASE_DIR, relPath);
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function getBaseFile(relPath: string, projectRoot: string = process.cwd()): string | null {
  const basePath = path.join(getCoreclawDir(projectRoot), BASE_DIR, relPath);
  if (!fs.existsSync(basePath)) return null;
  return fs.readFileSync(basePath, "utf-8");
}

export function hasBaseFile(relPath: string, projectRoot: string = process.cwd()): boolean {
  return fs.existsSync(path.join(getCoreclawDir(projectRoot), BASE_DIR, relPath));
}

// ---------- File Hashing ----------

export function hashFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function hashAllFiles(files: string[], projectRoot: string = process.cwd()): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const f of files) {
    hashes[f] = hashFile(path.join(projectRoot, f));
  }
  return hashes;
}
