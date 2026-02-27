import fs from "fs";
import path from "path";
import { SkillManifestSchema, type SkillManifest, type AvailableSkill } from "./types.js";
import { isSkillApplied } from "./state.js";

/**
 * Reads and validates a skill's manifest.json from a skill directory.
 * Skills live in skills/{name}/ with a manifest.json + add/ + modify/ directories.
 */
export function readManifest(skillDir: string): SkillManifest {
  const manifestPath = path.join(skillDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Skill manifest not found: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const result = SkillManifestSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid skill manifest at ${manifestPath}: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Lists all available skills from the skills/ directory.
 */
export function listAvailableSkills(
  skillsRoot: string = path.join(process.cwd(), "skills"),
  projectRoot?: string,
): AvailableSkill[] {
  if (!fs.existsSync(skillsRoot)) return [];

  const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  const skills: AvailableSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsRoot, entry.name);
    const manifestPath = path.join(skillDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = readManifest(skillDir);
      skills.push({
        name: manifest.skill,
        version: manifest.version,
        description: manifest.description,
        installed: isSkillApplied(manifest.skill, projectRoot),
        depends: manifest.depends,
        conflicts: manifest.conflicts,
        path: skillDir,
      });
    } catch {
      // Skip skills with invalid manifests
    }
  }

  return skills;
}

/**
 * Validates that a skill can be applied: checks dependencies, conflicts, etc.
 */
export function validatePreApply(
  manifest: SkillManifest,
  projectRoot: string = process.cwd(),
): string[] {
  const errors: string[] = [];

  if (isSkillApplied(manifest.skill, projectRoot)) {
    errors.push(`Skill "${manifest.skill}" is already applied`);
  }

  for (const dep of manifest.depends) {
    if (!isSkillApplied(dep, projectRoot)) {
      errors.push(`Missing dependency: "${dep}" must be applied first`);
    }
  }

  for (const conflict of manifest.conflicts) {
    if (isSkillApplied(conflict, projectRoot)) {
      errors.push(`Conflicts with applied skill: "${conflict}"`);
    }
  }

  return errors;
}
