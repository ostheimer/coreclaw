import fs from "fs";
import path from "path";
import { getCoreclawDir } from "./state.js";

const BACKUP_DIR = "backup";

/**
 * Creates a backup of specific files before a skill operation.
 * On failure, restoreBackup() reverts all changes atomically.
 */
export function createBackup(files: string[], projectRoot: string = process.cwd()): void {
  const backupDir = path.join(getCoreclawDir(projectRoot), BACKUP_DIR);
  clearBackup(projectRoot);

  const manifest: BackupManifest = { files: [], createdAt: new Date().toISOString() };

  for (const relPath of files) {
    const srcPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(srcPath)) continue;

    const destPath = path.join(backupDir, relPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    manifest.files.push(relPath);
  }

  fs.writeFileSync(
    path.join(backupDir, "_manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

/**
 * Restores all backed-up files, reverting changes from a failed skill operation.
 */
export function restoreBackup(projectRoot: string = process.cwd()): boolean {
  const backupDir = path.join(getCoreclawDir(projectRoot), BACKUP_DIR);
  const manifestPath = path.join(backupDir, "_manifest.json");

  if (!fs.existsSync(manifestPath)) return false;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as BackupManifest;

  for (const relPath of manifest.files) {
    const backupPath = path.join(backupDir, relPath);
    const targetPath = path.join(projectRoot, relPath);

    if (fs.existsSync(backupPath)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(backupPath, targetPath);
    }
  }

  clearBackup(projectRoot);
  return true;
}

/**
 * Clears the backup directory.
 */
export function clearBackup(projectRoot: string = process.cwd()): void {
  const backupDir = path.join(getCoreclawDir(projectRoot), BACKUP_DIR);
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

export function hasBackup(projectRoot: string = process.cwd()): boolean {
  const manifestPath = path.join(getCoreclawDir(projectRoot), BACKUP_DIR, "_manifest.json");
  return fs.existsSync(manifestPath);
}

interface BackupManifest {
  files: string[];
  createdAt: string;
}
