import { z } from "zod";

// ---------- Skill Manifest (manifest.yaml) ----------

export const SkillManifestSchema = z.object({
  skill: z.string().min(1),
  version: z.string().default("1.0.0"),
  description: z.string(),
  core_version: z.string().optional(),

  adds: z.array(z.string()).default([]),
  modifies: z.array(z.string()).default([]),

  structured: z.object({
    npm_dependencies: z.record(z.string()).default({}),
    env_additions: z.array(z.string()).default([]),
  }).default({}),

  conflicts: z.array(z.string()).default([]),
  depends: z.array(z.string()).default([]),

  test: z.string().optional(),
  post_apply: z.array(z.string()).default([]),

  file_ops: z.array(z.object({
    type: z.enum(["rename", "delete", "move"]),
    from: z.string(),
    to: z.string().optional(),
  })).default([]),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

// ---------- Skill State (.coreclaw/state.json) ----------

export interface AppliedSkill {
  name: string;
  version: string;
  appliedAt: string;
  fileHashes: Record<string, string>;
  structuredOutcomes: {
    npmDependencies?: Record<string, string>;
    envAdditions?: string[];
  };
}

export interface CustomModification {
  description: string;
  appliedAt: string;
  filesModified: string[];
  patchFile: string;
}

export interface SkillState {
  engineVersion: string;
  coreVersion: string;
  appliedSkills: AppliedSkill[];
  customModifications: CustomModification[];
}

// ---------- Apply Result ----------

export interface ApplyResult {
  success: boolean;
  skill: string;
  version: string;
  filesAdded: string[];
  filesModified: string[];
  mergeConflicts: string[];
  npmDepsAdded: Record<string, string>;
  envVarsAdded: string[];
  error?: string;
  durationMs: number;
}

// ---------- Uninstall Result ----------

export interface UninstallResult {
  success: boolean;
  skill: string;
  filesRemoved: string[];
  filesRestored: string[];
  error?: string;
}

// ---------- Available Skill (for GUI listing) ----------

export interface AvailableSkill {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  depends: string[];
  conflicts: string[];
  path: string;
}

export const ENGINE_VERSION = "0.1.0";
