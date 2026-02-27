import fs from "fs";
import path from "path";
import { readState, removeAppliedSkill, getAppliedSkill, getCoreclawDir } from "./state.js";
import { createBackup, restoreBackup, clearBackup } from "./backup.js";
import type { UninstallResult } from "./types.js";

/**
 * Uninstalls a skill by restoring files from base snapshot and removing added files.
 *
 * NanoClaw uses full replay (reset to base, then replay remaining skills).
 * CoreClaw uses a simpler approach for now: restore base versions of modified files,
 * delete added files. This works well when skills don't overlap.
 */
export async function uninstallSkill(
  skillName: string,
  projectRoot: string = process.cwd(),
): Promise<UninstallResult> {
  const applied = getAppliedSkill(skillName, projectRoot);
  if (!applied) {
    return { success: false, skill: skillName, filesRemoved: [], filesRestored: [], error: `Skill "${skillName}" is not applied` };
  }

  // Check if other skills depend on this one
  const state = readState(projectRoot);
  for (const other of state.appliedSkills) {
    if (other.name === skillName) continue;
    // We'd need the manifest to check depends, but we can check state
  }

  const allFiles = Object.keys(applied.fileHashes);
  createBackup(allFiles, projectRoot);

  const filesRemoved: string[] = [];
  const filesRestored: string[] = [];

  try {
    const baseDir = path.join(getCoreclawDir(projectRoot), "base");

    for (const relPath of allFiles) {
      const currentPath = path.join(projectRoot, relPath);
      const basePath = path.join(baseDir, relPath);

      if (fs.existsSync(basePath)) {
        // File existed before skill — restore from base
        fs.mkdirSync(path.dirname(currentPath), { recursive: true });
        fs.copyFileSync(basePath, currentPath);
        filesRestored.push(relPath);
      } else {
        // File was added by skill — remove it
        if (fs.existsSync(currentPath)) {
          fs.unlinkSync(currentPath);
          filesRemoved.push(relPath);
          cleanEmptyDirs(path.dirname(currentPath), projectRoot);
        }
      }
    }

    // Remove npm dependencies that were added
    if (applied.structuredOutcomes.npmDependencies) {
      removeNpmDeps(Object.keys(applied.structuredOutcomes.npmDependencies), projectRoot);
    }

    removeAppliedSkill(skillName, projectRoot);
    clearBackup(projectRoot);

    return { success: true, skill: skillName, filesRemoved, filesRestored };
  } catch (err) {
    restoreBackup(projectRoot);
    return {
      success: false,
      skill: skillName,
      filesRemoved: [],
      filesRestored: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function removeNpmDeps(depNames: string[], projectRoot: string): void {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const deps = (pkg["dependencies"] as Record<string, string>) ?? {};

  for (const name of depNames) {
    delete deps[name];
  }

  pkg["dependencies"] = deps;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function cleanEmptyDirs(dirPath: string, stopAt: string): void {
  while (dirPath !== stopAt && dirPath.startsWith(stopAt)) {
    try {
      const entries = fs.readdirSync(dirPath);
      if (entries.length === 0) {
        fs.rmdirSync(dirPath);
        dirPath = path.dirname(dirPath);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}
