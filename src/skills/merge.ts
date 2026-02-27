import fs from "fs";
import path from "path";
import os from "os";
import { execFileNoThrow } from "../utils/execFileNoThrow.js";

export interface MergeResult {
  success: boolean;
  content: string;
  hasConflicts: boolean;
}

/**
 * Three-way merge using git merge-file (same approach as NanoClaw).
 * Merges skill modifications into the current file while preserving local changes.
 *
 * base    = original file before any modifications (.coreclaw/base/)
 * current = file as it currently exists (may have user modifications)
 * skill   = the skill's version of the file (skills/{name}/modify/)
 */
export async function threeWayMerge(
  basePath: string,
  currentPath: string,
  skillPath: string,
): Promise<MergeResult> {
  // If base doesn't exist, this file was added by a previous skill.
  // Fall back to simple overlay.
  if (!fs.existsSync(basePath)) {
    const content = fs.readFileSync(skillPath, "utf-8");
    return { success: true, content, hasConflicts: false };
  }

  if (!fs.existsSync(currentPath)) {
    const content = fs.readFileSync(skillPath, "utf-8");
    return { success: true, content, hasConflicts: false };
  }

  // Write to temp files for git merge-file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coreclaw-merge-"));
  const tmpBase = path.join(tmpDir, "base");
  const tmpCurrent = path.join(tmpDir, "current");
  const tmpSkill = path.join(tmpDir, "skill");

  try {
    fs.copyFileSync(basePath, tmpBase);
    fs.copyFileSync(currentPath, tmpCurrent);
    fs.copyFileSync(skillPath, tmpSkill);

    // git merge-file modifies the "current" file in place
    // Exit 0 = clean merge, Exit 1 = conflicts (marked in file), Exit < 0 = error
    const result = await execFileNoThrow("git", [
      "merge-file",
      "-p",           // Print to stdout instead of modifying in place
      tmpCurrent,
      tmpBase,
      tmpSkill,
    ]);

    const content = result.stdout || fs.readFileSync(tmpCurrent, "utf-8");
    const hasConflicts = content.includes("<<<<<<<") && content.includes(">>>>>>>");

    return {
      success: !hasConflicts,
      content,
      hasConflicts,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Simple file copy — for new files added by a skill (no merge needed).
 */
export function copySkillFile(
  skillFilePath: string,
  targetPath: string,
): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(skillFilePath, targetPath);
}
