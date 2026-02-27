import fs from "fs";
import path from "path";
import { readManifest, validatePreApply } from "./manifest.js";
import {
  initSkillsDir,
  addAppliedSkill,
  snapshotFileToBase,
  getBaseFile,
  hashAllFiles,
  getCoreclawDir,
} from "./state.js";
import { createBackup, restoreBackup, clearBackup } from "./backup.js";
import { threeWayMerge, copySkillFile } from "./merge.js";
import { execFileNoThrow } from "../utils/execFileNoThrow.js";
import type { ApplyResult, AppliedSkill, SkillManifest } from "./types.js";

/**
 * Applies a skill to the project.
 *
 * Flow (adopted from NanoClaw's skills engine):
 * 1. Pre-flight checks (deps, conflicts, already applied)
 * 2. Create backup of all files that will be touched
 * 3. Copy new files from skill's add/ directory
 * 4. Three-way merge modified files (base → current vs base → skill)
 * 5. Merge npm dependencies into package.json
 * 6. Add env vars to .env.example
 * 7. Run npm install if needed
 * 8. Run post_apply commands
 * 9. Record state + snapshot base files
 * 10. On ANY failure: restore backup (atomic rollback)
 */
export async function applySkill(
  skillDir: string,
  projectRoot: string = process.cwd(),
): Promise<ApplyResult> {
  const start = Date.now();
  const manifest = readManifest(skillDir);

  initSkillsDir(projectRoot);

  // Pre-flight checks
  const errors = validatePreApply(manifest, projectRoot);
  if (errors.length > 0) {
    return failResult(manifest, errors.join("; "), start);
  }

  // Determine all files that will be touched
  const allAffectedFiles = [...manifest.adds, ...manifest.modifies];
  if (manifest.structured.npm_dependencies && Object.keys(manifest.structured.npm_dependencies).length > 0) {
    allAffectedFiles.push("package.json");
  }

  // Create backup before any mutations
  createBackup(allAffectedFiles, projectRoot);

  const filesAdded: string[] = [];
  const filesModified: string[] = [];
  const mergeConflicts: string[] = [];

  try {
    // Step 1: Execute file operations (rename, delete, move)
    for (const op of manifest.file_ops) {
      executeFileOp(op, projectRoot);
    }

    // Step 2: Copy new files from add/ directory
    for (const relPath of manifest.adds) {
      const srcPath = path.join(skillDir, "add", relPath);
      const destPath = path.join(projectRoot, relPath);

      if (!fs.existsSync(srcPath)) {
        throw new Error(`Skill declares add file "${relPath}" but it doesn't exist in ${skillDir}/add/`);
      }

      copySkillFile(srcPath, destPath);
      filesAdded.push(relPath);
    }

    // Step 3: Three-way merge modified files
    for (const relPath of manifest.modifies) {
      const skillFilePath = path.join(skillDir, "modify", relPath);
      const currentFilePath = path.join(projectRoot, relPath);

      if (!fs.existsSync(skillFilePath)) {
        throw new Error(`Skill declares modify file "${relPath}" but it doesn't exist in ${skillDir}/modify/`);
      }

      // Ensure base snapshot exists for this file
      if (!getBaseFile(relPath, projectRoot)) {
        snapshotFileToBase(relPath, projectRoot);
      }

      const basePath = path.join(getCoreclawDir(projectRoot), "base", relPath);
      const result = await threeWayMerge(basePath, currentFilePath, skillFilePath);

      if (result.hasConflicts) {
        mergeConflicts.push(relPath);
      }

      // Write merged content
      fs.mkdirSync(path.dirname(currentFilePath), { recursive: true });
      fs.writeFileSync(currentFilePath, result.content);
      filesModified.push(relPath);
    }

    // Step 4: Merge npm dependencies
    const npmDepsAdded: Record<string, string> = {};
    if (manifest.structured.npm_dependencies) {
      const deps = manifest.structured.npm_dependencies;
      if (Object.keys(deps).length > 0) {
        mergeNpmDeps(deps, projectRoot);
        Object.assign(npmDepsAdded, deps);
      }
    }

    // Step 5: Add env vars to .env.example
    const envVarsAdded: string[] = [];
    if (manifest.structured.env_additions.length > 0) {
      addEnvVars(manifest.structured.env_additions, projectRoot);
      envVarsAdded.push(...manifest.structured.env_additions);
    }

    // Step 6: Run npm install if new deps were added
    if (Object.keys(npmDepsAdded).length > 0) {
      const installResult = await execFileNoThrow("npm", ["install"], { cwd: projectRoot });
      if (installResult.status === "error") {
        throw new Error(`npm install failed: ${installResult.stderr}`);
      }
    }

    // Step 7: Run post_apply commands
    for (const cmd of manifest.post_apply) {
      const parts = cmd.split(" ");
      const bin = parts[0]!;
      const args = parts.slice(1);
      await execFileNoThrow(bin, args, { cwd: projectRoot });
    }

    // Step 8: Run tests if defined
    if (manifest.test) {
      const parts = manifest.test.split(" ");
      const testResult = await execFileNoThrow(parts[0]!, parts.slice(1), { cwd: projectRoot });
      if (testResult.status === "error") {
        throw new Error(`Skill tests failed: ${testResult.stderr}`);
      }
    }

    // Step 9: Record state
    const fileHashes = hashAllFiles([...filesAdded, ...filesModified], projectRoot);
    const applied: AppliedSkill = {
      name: manifest.skill,
      version: manifest.version,
      appliedAt: new Date().toISOString(),
      fileHashes,
      structuredOutcomes: {
        npmDependencies: npmDepsAdded,
        envAdditions: envVarsAdded,
      },
    };
    addAppliedSkill(applied, projectRoot);

    // Update base snapshots only for modified files (not added — they have no "before")
    for (const f of filesModified) {
      snapshotFileToBase(f, projectRoot);
    }

    clearBackup(projectRoot);

    return {
      success: mergeConflicts.length === 0,
      skill: manifest.skill,
      version: manifest.version,
      filesAdded,
      filesModified,
      mergeConflicts,
      npmDepsAdded,
      envVarsAdded,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    // Atomic rollback
    restoreBackup(projectRoot);

    const error = err instanceof Error ? err.message : String(err);
    return failResult(manifest, error, start);
  }
}

// ---------- Helpers ----------

function failResult(manifest: SkillManifest, error: string, start: number): ApplyResult {
  return {
    success: false,
    skill: manifest.skill,
    version: manifest.version,
    filesAdded: [],
    filesModified: [],
    mergeConflicts: [],
    npmDepsAdded: {},
    envVarsAdded: [],
    error,
    durationMs: Date.now() - start,
  };
}

function executeFileOp(
  op: { type: string; from: string; to?: string },
  projectRoot: string,
): void {
  const fromPath = path.join(projectRoot, op.from);
  switch (op.type) {
    case "delete":
      if (fs.existsSync(fromPath)) fs.unlinkSync(fromPath);
      break;
    case "rename":
    case "move":
      if (op.to && fs.existsSync(fromPath)) {
        const toPath = path.join(projectRoot, op.to);
        fs.mkdirSync(path.dirname(toPath), { recursive: true });
        fs.renameSync(fromPath, toPath);
      }
      break;
  }
}

function mergeNpmDeps(deps: Record<string, string>, projectRoot: string): void {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const existing = (pkg["dependencies"] as Record<string, string>) ?? {};
  pkg["dependencies"] = { ...existing, ...deps };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function addEnvVars(vars: string[], projectRoot: string): void {
  const envPath = path.join(projectRoot, ".env.example");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  for (const v of vars) {
    if (!content.includes(v)) {
      content += `\n# Added by skill\n${v}=\n`;
    }
  }

  fs.writeFileSync(envPath, content);
}
